import {
  type CodeNode,
  type HeadingNode,
  type ListItemNode,
  type MarkdownParseError,
  type MarkdownTagNode,
  type WikilinkNode,
  type YamlFrontmatterNode
} from "@kb/markdown-ast"
import { Chunk, Context, Effect, Option, Result, String as Str, Trie } from "effect"
import { Markdown } from "./markdown/Markdown"
import { MarkdownFile, sourceRef, type MarkdownTree, type SourcePosition, type SourceRef } from "./markdown/MarkdownModel"

import type { VaultIoError } from "./VaultErrors"

import { allMarkdown, VaultScope } from "./VaultScope"

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

export type VaultSearchResult =
  | { readonly _tag: "Note"; readonly path: string; readonly text: string; readonly record: VaultNoteRecord }
  | { readonly _tag: "Heading"; readonly path: string; readonly text: string; readonly record: VaultHeadingRecord }
  | { readonly _tag: "Link"; readonly path: string; readonly text: string; readonly record: VaultLinkRecord }
  | { readonly _tag: "Tag"; readonly path: string; readonly text: string; readonly record: VaultTagRecord }

export type VaultShape = {
  readonly scope: VaultScope
  readonly tree: MarkdownTree
  readonly notes: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultNoteRecord>, VaultIoError>
  readonly frontmatter: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultFrontmatterRecord>, VaultIoError>
  readonly headings: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultHeadingRecord>, VaultIoError>
  readonly links: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultLinkRecord>, VaultIoError>
  readonly tags: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultTagRecord>, VaultIoError>
  readonly listItems: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultListItemRecord>, VaultIoError>
  readonly fencedBlocks: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultFencedBlockRecord>, VaultIoError>
  readonly diagnostics: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultDiagnostic>, VaultIoError>
  readonly search: (scope: VaultScope, query: string) => Effect.Effect<Chunk.Chunk<VaultSearchResult>, VaultIoError>
  readonly sourceLine: (path: string, line: number) => string | undefined
  readonly sourceExcerpt: (path: string, position: SourcePosition | undefined) => string | undefined
}

export type VaultProjectionMethods = Pick<
  VaultShape,
  | "notes"
  | "frontmatter"
  | "headings"
  | "links"
  | "tags"
  | "listItems"
  | "fencedBlocks"
  | "diagnostics"
>

export class Vault extends Context.Service<Vault, VaultShape>()("@kb/vault-core/Vault") {
  static make({
    scope = allMarkdown,
    tree,
    projections
  }: {
    readonly scope?: VaultScope
    readonly tree: MarkdownTree
    readonly projections?: VaultProjectionMethods
  }): Effect.Effect<VaultShape> {
    return makeVault({ scope, tree, projections })
  }
}

const makeVault = ({
  scope,
  tree,
  projections
}: {
  readonly scope: VaultScope
  readonly tree: MarkdownTree
  readonly projections?: VaultProjectionMethods | undefined
}): Effect.Effect<VaultShape> =>
  Effect.sync(() => {
    const resolvedProjections = projections ?? projectionMethodsForTree(scope, tree)
    return Vault.of({
      scope,
      tree,
      notes: resolvedProjections.notes,
      frontmatter: resolvedProjections.frontmatter,
      headings: resolvedProjections.headings,
      links: resolvedProjections.links,
      tags: resolvedProjections.tags,
      listItems: resolvedProjections.listItems,
      fencedBlocks: resolvedProjections.fencedBlocks,
      diagnostics: resolvedProjections.diagnostics,
      search: (narrowScope, query) => searchVault(resolvedProjections, narrowScope, query),
      sourceLine: (path, line) => sourceLine(fileContents(tree, path), line),
      sourceExcerpt: (path, position) => sourceLine(fileContents(tree, path), position?.start.line)
    })
  })

const projectionMethodsForTree = (scope: VaultScope, tree: MarkdownTree): VaultProjectionMethods => ({
  notes: (narrowScope?: VaultScope) => Effect.succeed(notesForScope(tree, narrowScope ?? scope)),
  frontmatter: (narrowScope?: VaultScope) =>
    Effect.succeed(recordsForScope(tree, narrowScope ?? scope, frontmatterRecordsForFile)),
  headings: (narrowScope?: VaultScope) =>
    Effect.succeed(recordsForScope(tree, narrowScope ?? scope, headingRecordsForFile)),
  links: (narrowScope?: VaultScope) =>
    Effect.succeed(recordsForScope(tree, narrowScope ?? scope, linkRecordsForFile)),
  tags: (narrowScope?: VaultScope) =>
    Effect.succeed(recordsForScope(tree, narrowScope ?? scope, tagRecordsForFile)),
  listItems: (narrowScope?: VaultScope) =>
    Effect.succeed(recordsForScope(tree, narrowScope ?? scope, listItemRecordsForFile)),
  fencedBlocks: (narrowScope?: VaultScope) =>
    Effect.succeed(recordsForScope(tree, narrowScope ?? scope, fencedBlockRecordsForFile)),
  diagnostics: (narrowScope?: VaultScope) => Effect.succeed(diagnosticsForScope(tree, narrowScope ?? scope))
})

const recordsForScope = <Record>(
  tree: MarkdownTree,
  scope: VaultScope,
  project: (path: string, file: MarkdownFile) => Chunk.Chunk<Record>
): Chunk.Chunk<Record> => {
  let records = Chunk.empty<Record>()
  for (const [path, result] of Trie.entries(tree.files)) {
    if (pathMatchesScope(path, scope) && Result.isSuccess(result)) {
      records = Chunk.appendAll(records, project(path, markdownFileAtPath(path, result.success)))
    }
  }
  return records
}

const notesForScope = (tree: MarkdownTree, scope: VaultScope): Chunk.Chunk<VaultNoteRecord> =>
  recordsForScope(tree, scope, noteRecordsForFile)

export const noteRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultNoteRecord> =>
  Chunk.of({
    path,
    file
  })

const diagnosticsForScope = (tree: MarkdownTree, scope: VaultScope): Chunk.Chunk<VaultDiagnostic> => {
  let diagnostics = Chunk.empty<VaultDiagnostic>()
  for (const [path, result] of Trie.entries(tree.files)) {
    if (pathMatchesScope(path, scope) && Result.isFailure(result)) {
      diagnostics = Chunk.append(diagnostics, { path, message: result.failure.message, cause: result.failure })
    }
  }
  return diagnostics
}

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
    text: Markdown.text(node),
  }))

export const linkRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultLinkRecord> =>
  Chunk.map(Markdown.wikilinks(file), (node) => ({
    ...sourceRecord(path, file, node),
    target: node.target,
    value: node.value,
    original: node.original,
    ...optionalString("alias", optionString(node.alias)),
    ...optionalString("heading", optionString(node.header)),
    ...optionalString("block", optionString(node.block)),
  }))

export const tagRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultTagRecord> =>
  Chunk.map(Markdown.tags(file), (node) => ({
    ...sourceRecord(path, file, node),
    value: node.value,
  }))

export const listItemRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultListItemRecord> =>
  Chunk.map(Markdown.listItems(file), (node) => ({
    ...sourceRecord(path, file, node),
    text: Markdown.listItemText(node),
    ...optionalChecked(optionValue(node.checked)),
  }))


export const fencedBlockRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultFencedBlockRecord> =>
  Chunk.map(Markdown.fencedBlocks(file), (node) => ({
    ...sourceRecord(path, file, node),
    value: node.value,
    ...optionalString("language", Markdown.fencedBlockLanguage(node)),
    ...optionalString("meta", Markdown.fencedBlockMeta(node)),
  }))

const markdownFileAtPath = (path: string, file: MarkdownFile): MarkdownFile =>
  file.path === path ? file : new MarkdownFile({ path, contents: file.contents, mdast: file.mdast })

type SearchSources = Pick<VaultProjectionMethods, "notes" | "headings" | "links" | "tags">

const searchVault = (
  sources: SearchSources,
  scope: VaultScope,
  query: string
): Effect.Effect<Chunk.Chunk<VaultSearchResult>, VaultIoError> =>
  Effect.gen(function* () {
    const needle = Str.toLowerCase(query)
    const results: Array<VaultSearchResult> = []
    const notes = yield* sources.notes(scope)
    const headings = yield* sources.headings(scope)
    const links = yield* sources.links(scope)
    const tags = yield* sources.tags(scope)

    for (const note of notes) {
      const title = titleFromPath(note.path)
      if (matches(needle, note.path, title)) {
        results.push({ _tag: "Note", path: note.path, text: title, record: note })
      }
    }
    for (const heading of headings) {
      if (matches(needle, heading.text)) {
        results.push({ _tag: "Heading", path: heading.path, text: heading.text, record: heading })
      }
    }
    for (const link of links) {
      if (matches(needle, link.value, link.target, link.alias, link.heading, link.block)) {
        results.push({ _tag: "Link", path: link.path, text: link.value, record: link })
      }
    }
    for (const tag of tags) {
      if (matches(needle, tag.value)) {
        results.push({ _tag: "Tag", path: tag.path, text: tag.value, record: tag })
      }
    }
    return Chunk.fromIterable(results)
  })

const pathMatchesScope = (path: string, scope: VaultScope): boolean => {
  for (const pattern of scope.patterns) {
    if (pattern === "**/*.md" || pattern === path) {
      return true
    }
    if (pattern.endsWith("/**/*.md") && path.startsWith(pattern.slice(0, -"/**/*.md".length) + "/")) {
      return true
    }
    if (pattern.endsWith("*.md") && path.startsWith(pattern.slice(0, -"*.md".length))) {
      return true
    }
  }
  return false
}

const fileContents = (tree: MarkdownTree, path: string): string | undefined => {
  const result = Trie.get(tree.files, path)
  return Option.isSome(result) && Result.isSuccess(result.value) ? result.value.success.contents : undefined
}

const sourceLine = (contents: string | undefined, lineNumber: number | undefined): string | undefined => {
  if (contents === undefined || lineNumber === undefined) {
    return undefined
  }
  let currentLine = 1
  let start = 0
  let index = 0
  while (index < contents.length) {
    if (contents.charCodeAt(index) === 10) {
      if (currentLine === lineNumber) {
        return contents.slice(start, index)
      }
      currentLine += 1
      start = index + 1
    }
    index += 1
  }
  return currentLine === lineNumber ? contents.slice(start) : undefined
}

const titleFromPath = (path: string): string => {
  const lastSlash = path.lastIndexOf("/")
  const fileName = lastSlash === -1 ? path : path.slice(lastSlash + 1)
  return Str.endsWith(".md")(fileName) ? fileName.slice(0, -3) : fileName
}


const matches = (needle: string, ...values: ReadonlyArray<string | undefined>): boolean => {
  for (const value of values) {
    if (value !== undefined && Str.includes(needle)(Str.toLowerCase(value))) {
      return true
    }
  }
  return false
}


const optionValue = <Value>(option: Option.Option<Value>): Value | undefined =>
  Option.isSome(option) ? option.value : undefined

const optionString = (option: Option.Option<string>): string | undefined => optionValue(option)

const sourceRecord = <Node>(
  path: string,
  file: MarkdownFile,
  node: Node
): VaultRecord<Node> => {
  const position = Markdown.position(node)
  return {
    path,
    file,
    node,
    source: sourceRef(path, file, node, position),
    ...optionalPosition(position)
  }
}

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

