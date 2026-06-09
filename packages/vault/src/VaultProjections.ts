import {
  nodeText,
  listItemText,
  type CodeNode,
  type HeadingNode,
  type ListItemNode,
  type MarkdownParseError,
  type MarkdownTagNode,
  type WikilinkNode,
  type YamlFrontmatterNode
} from "@kb/markdown-ast"
import { Chunk, Option, Result, String as Str, Trie } from "effect"

import * as Markdown from "./markdown/Markdown"
import { MarkdownFile, sourceRef, type SourcePosition, type SourceRef } from "./markdown/MarkdownModel"
import { Vault, type VaultFiles } from "./Vault"
import { VaultScope } from "./VaultScope"

export type VaultRecord<Node> = {
  readonly path: string
  readonly file: MarkdownFile
  readonly node: Node
  readonly source: SourceRef<Node>
  readonly position?: SourcePosition | undefined
}

export type VaultNoteRecord = {
  readonly path: string
  readonly file: MarkdownFile
}

export type VaultFrontmatterRecord = VaultRecord<YamlFrontmatterNode> & {
  readonly value: unknown
  readonly language?: string
}

export type VaultHeadingRecord = VaultRecord<HeadingNode> & {
  readonly depth: number
  readonly text: string
}

export type VaultLinkRecord = VaultRecord<WikilinkNode> & {
  readonly target: string
  readonly value: string
  readonly original: string
  readonly alias?: string
  readonly heading?: string
  readonly block?: string
}

export type VaultTagRecord = VaultRecord<MarkdownTagNode> & {
  readonly value: string
}

export type VaultListItemRecord = VaultRecord<ListItemNode> & {
  readonly text: string
  readonly checked?: boolean
}

export type VaultFencedBlockRecord = VaultRecord<CodeNode> & {
  readonly value: string
  readonly language?: string
  readonly meta?: string
}

export type VaultDiagnostic = {
  readonly path: string
  readonly message: string
  readonly cause: MarkdownParseError
}

export const filterVault = (vault: Vault, scope: VaultScope): Vault =>
  Vault.of({ scope, files: filesForPatterns(vault.files, scope.patterns) } as Vault)

export const notes = (vault: Vault): Chunk.Chunk<VaultNoteRecord> => recordsForVault(vault, noteRecordsForFile)

export const frontmatter = (vault: Vault): Chunk.Chunk<VaultFrontmatterRecord> =>
  recordsForVault(vault, frontmatterRecordsForFile)

export const headings = (vault: Vault): Chunk.Chunk<VaultHeadingRecord> =>
  recordsForVault(vault, headingRecordsForFile)

export const links = (vault: Vault): Chunk.Chunk<VaultLinkRecord> => recordsForVault(vault, linkRecordsForFile)

export const tags = (vault: Vault): Chunk.Chunk<VaultTagRecord> => recordsForVault(vault, tagRecordsForFile)

export const listItems = (vault: Vault): Chunk.Chunk<VaultListItemRecord> =>
  recordsForVault(vault, listItemRecordsForFile)

export const fencedBlocks = (vault: Vault): Chunk.Chunk<VaultFencedBlockRecord> =>
  recordsForVault(vault, fencedBlockRecordsForFile)

export const diagnostics = (vault: Vault): Chunk.Chunk<VaultDiagnostic> => {
  let records = Chunk.empty<VaultDiagnostic>()
  for (const [path, result] of Trie.entries(vault.files)) {
    if (Result.isFailure(result)) {
      records = Chunk.append(records, { path, message: result.failure.message, cause: result.failure })
    }
  }
  return records
}

export const noteRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultNoteRecord> =>
  Chunk.of({
    path,
    file
  })

export const frontmatterRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultFrontmatterRecord> =>
  Chunk.map(Markdown.frontmatter(file), (node) => ({
    ...sourceRecord(path, file, node),
    value: node.value,
    language: "yaml"
  }))

export const headingRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultHeadingRecord> =>
  Chunk.map(Markdown.headings(file), (node) => ({
    ...sourceRecord(path, file, node),
    depth: node.depth,
    text: nodeText(node)
  }))

export const linkRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultLinkRecord> =>
  Chunk.map(Markdown.wikilinks(file), (node) => ({
    ...sourceRecord(path, file, node),
    target: node.target,
    value: node.value,
    original: node.original,
    ...optionalString("alias", optionString(node.alias)),
    ...optionalString("heading", optionString(node.header)),
    ...optionalString("block", optionString(node.block))
  }))

export const tagRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultTagRecord> =>
  Chunk.map(Markdown.tags(file), (node) => ({
    ...sourceRecord(path, file, node),
    value: node.value
  }))

export const listItemRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultListItemRecord> =>
  Chunk.map(Markdown.listItems(file), (node) => ({
    ...sourceRecord(path, file, node),
    text: listItemText(node),
    ...optionalChecked(optionValue(node.checked))
  }))

export const fencedBlockRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultFencedBlockRecord> =>
  Chunk.map(Markdown.fencedBlocks(file), (node) => ({
    ...sourceRecord(path, file, node),
    value: node.value,
    ...optionalString("language", optionString(node.lang)),
    ...optionalString("meta", optionString(node.meta))
  }))

const recordsForVault = <Record>(
  vault: Vault,
  project: (path: string, file: MarkdownFile) => Chunk.Chunk<Record>
): Chunk.Chunk<Record> => {
  let records = Chunk.empty<Record>()
  for (const [path, result] of Trie.entries(vault.files)) {
    if (Result.isSuccess(result)) {
      records = Chunk.appendAll(records, project(path, markdownFileAtPath(path, result.success)))
    }
  }
  return records
}

const filesForPatterns = (files: VaultFiles, patterns: Chunk.Chunk<string>): VaultFiles => {
  if (Chunk.some(patterns, isAllMarkdownPattern)) {
    return files
  }
  const entries: Array<readonly [string, Result.Result<MarkdownFile, MarkdownParseError>]> = []
  for (const pattern of patterns) {
    appendPatternEntries(entries, files, normalizePath(pattern))
  }
  return Trie.fromIterable(entries)
}

const appendPatternEntries = (
  entries: Array<readonly [string, Result.Result<MarkdownFile, MarkdownParseError>]>,
  files: VaultFiles,
  pattern: string
): void => {
  if (pattern.endsWith("/**/*.md")) {
    appendEntries(entries, Trie.entriesWithPrefix(files, `${pattern.slice(0, -"/**/*.md".length)}/`))
    return
  }
  if (!isGlobPattern(pattern) && Str.endsWith(".md")(pattern)) {
    const result = Trie.get(files, pattern)
    if (Option.isSome(result)) {
      entries.push([pattern, result.value] as const)
    }
    return
  }
  appendEntries(entries, Trie.entries(Trie.filter(files, (_result, path) => pathMatchesPattern(path, pattern))))
}

const appendEntries = <Value>(
  entries: Array<readonly [string, Value]>,
  source: Iterable<readonly [string, Value]>
): void => {
  for (const entry of source) {
    entries.push(entry)
  }
}

const pathMatchesPattern = (path: string, pattern: string): boolean => {
  if (isAllMarkdownPattern(pattern) || pattern === path) {
    return true
  }
  if (pattern.endsWith("/**/*.md") && path.startsWith(`${pattern.slice(0, -"/**/*.md".length)}/`)) {
    return true
  }
  if (pattern.endsWith("*.md") && path.startsWith(pattern.slice(0, -"*.md".length))) {
    return true
  }
  return false
}

const isAllMarkdownPattern = (pattern: string): boolean => pattern === "**/*.md"

const isGlobPattern = (value: string): boolean => value.includes("*") || value.includes("?") || value.includes("[")

const normalizePath = (path: string): string => {
  const normalized = Str.replaceAll("\\", "/")(path)
  const withoutCurrentDirectory = Str.startsWith("./")(normalized) ? normalized.slice(2) : normalized
  return Str.endsWith("/")(withoutCurrentDirectory) ? withoutCurrentDirectory.slice(0, -1) : withoutCurrentDirectory
}

const markdownFileAtPath = (path: string, file: MarkdownFile): MarkdownFile =>
  file.path === path ? file : new MarkdownFile({ path, contents: file.contents, mdast: file.mdast })

const sourceRecord = <Node>(path: string, file: MarkdownFile, node: Node): VaultRecord<Node> => {
  const position = sourcePosition(node)
  return {
    path,
    file,
    node,
    source: sourceRef(path, file, node, position),
    ...optionalPosition(position)
  }
}

const sourcePosition = (node: unknown): SourcePosition | undefined =>
  node !== null && typeof node === "object" && "position" in node
    ? (node as { readonly position?: SourcePosition }).position
    : undefined

const optionalPosition = <P>(position: P | undefined): { readonly position?: P } => {
  if (position === undefined) {
    return {}
  }
  return { position }
}

const optionalChecked = (checked: boolean | null | undefined): { readonly checked?: boolean } => {
  if (typeof checked === "boolean") {
    return { checked }
  }
  return {}
}

const optionalString = <Key extends string>(key: Key, value: string | undefined): Partial<Record<Key, string>> => {
  if (value === undefined || value.length === 0) {
    return {}
  }
  return { [key]: value } as Partial<Record<Key, string>>
}

const optionValue = <Value>(option: Option.Option<Value>): Value | undefined =>
  Option.isSome(option) ? option.value : undefined

const optionString = (option: Option.Option<string>): string | undefined => optionValue(option)
