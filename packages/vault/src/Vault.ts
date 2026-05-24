import type { ObsidianListItem, ObsidianTag, ObsidianWikilink } from "@kb/remark-obsidian"
import type { Code, Heading, ListItem, Yaml } from "mdast"
import { Cache, Chunk, Context, Effect, Option, Result, String as Str, Trie } from "effect"
import { Markdown } from "./markdown/Markdown"
import { MarkdownFile, type MarkdownTree, type SourcePosition } from "./markdown/MarkdownModel"
import { parsedTasksFromMarkdownFile } from "./TaskParser"
import type { ParsedTask } from "./TaskModel"
import type { MarkdownParseError } from "./VaultErrors"
import { allMarkdown, VaultScope } from "./VaultScope"

export type VaultRecord<Node> = {
  readonly path: string
  readonly file: MarkdownFile
  readonly node: Node
  readonly position?: SourcePosition | undefined
}

export type VaultNoteRecord = {
  readonly path: string
  readonly file: MarkdownFile
}

export type VaultFrontmatterRecord = VaultRecord<Yaml> & {
  readonly value: string
  readonly language?: string
}

export type VaultHeadingRecord = VaultRecord<Heading> & {
  readonly depth: number
  readonly text: string
}

export type VaultLinkRecord = VaultRecord<ObsidianWikilink> & {
  readonly target: string
  readonly value: string
  readonly original: string
  readonly alias?: string
  readonly heading?: string
  readonly block?: string
}

export type VaultTagRecord = VaultRecord<ObsidianTag> & {
  readonly value: string
}

export type VaultListItemRecord = VaultRecord<ListItem> & {
  readonly text: string
  readonly checked?: boolean
}

export type VaultTaskRecord = VaultRecord<ObsidianListItem> & {
  readonly task: ParsedTask
  readonly done: boolean
  readonly text: string
  readonly fields: Readonly<Record<string, string>>
  readonly unknownFields: Readonly<Record<string, string>>
  readonly tags: Chunk.Chunk<string>
}

export type VaultFencedBlockRecord = VaultRecord<Code> & {
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
  | { readonly _tag: "Task"; readonly path: string; readonly text: string; readonly record: VaultTaskRecord }
  | { readonly _tag: "Heading"; readonly path: string; readonly text: string; readonly record: VaultHeadingRecord }
  | { readonly _tag: "Link"; readonly path: string; readonly text: string; readonly record: VaultLinkRecord }
  | { readonly _tag: "Tag"; readonly path: string; readonly text: string; readonly record: VaultTagRecord }

export type VaultShape = {
  readonly scope: VaultScope
  readonly tree: MarkdownTree
  readonly notes: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultNoteRecord>>
  readonly frontmatter: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultFrontmatterRecord>>
  readonly headings: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultHeadingRecord>>
  readonly links: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultLinkRecord>>
  readonly tags: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultTagRecord>>
  readonly listItems: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultListItemRecord>>
  readonly tasks: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultTaskRecord>>
  readonly fencedBlocks: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultFencedBlockRecord>>
  readonly diagnostics: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultDiagnostic>>
  readonly search: (scope: VaultScope, query: string) => Effect.Effect<Chunk.Chunk<VaultSearchResult>>
  readonly sourceLine: (path: string, line: number) => string | undefined
  readonly sourceExcerpt: (path: string, position: SourcePosition | undefined) => string | undefined
}

export class Vault extends Context.Service<Vault, VaultShape>()("@kb/vault/Vault") {
  static make({
    scope = allMarkdown,
    tree
  }: {
    readonly scope?: VaultScope
    readonly tree: MarkdownTree
  }): Effect.Effect<VaultShape> {
    return makeVault({ scope, tree })
  }
}

const makeVault = ({
  scope,
  tree
}: {
  readonly scope: VaultScope
  readonly tree: MarkdownTree
}): Effect.Effect<VaultShape> =>
  Effect.gen(function* () {
    const frontmatterCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(recordsForScope(tree, scopeFromKey(key), frontmatterRecordsForFile))
    })
    const headingCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(recordsForScope(tree, scopeFromKey(key), headingRecordsForFile))
    })
    const linkCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(recordsForScope(tree, scopeFromKey(key), linkRecordsForFile))
    })
    const tagCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(recordsForScope(tree, scopeFromKey(key), tagRecordsForFile))
    })
    const listItemCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(recordsForScope(tree, scopeFromKey(key), listItemRecordsForFile))
    })
    const taskCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(recordsForScope(tree, scopeFromKey(key), taskRecordsForFile))
    })
    const fencedBlockCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(recordsForScope(tree, scopeFromKey(key), fencedBlockRecordsForFile))
    })
    const diagnosticCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(diagnosticsForScope(tree, scopeFromKey(key)))
    })
    const noteCache = yield* Cache.make({
      capacity: Number.POSITIVE_INFINITY,
      lookup: (key: string) => Effect.succeed(notesForScope(tree, scopeFromKey(key)))
    })

    const frontmatter = (narrowScope?: VaultScope) => Cache.get(frontmatterCache, scopeKey(narrowScope ?? scope))
    const headings = (narrowScope?: VaultScope) => Cache.get(headingCache, scopeKey(narrowScope ?? scope))
    const links = (narrowScope?: VaultScope) => Cache.get(linkCache, scopeKey(narrowScope ?? scope))
    const tags = (narrowScope?: VaultScope) => Cache.get(tagCache, scopeKey(narrowScope ?? scope))
    const listItems = (narrowScope?: VaultScope) => Cache.get(listItemCache, scopeKey(narrowScope ?? scope))
    const tasks = (narrowScope?: VaultScope) => Cache.get(taskCache, scopeKey(narrowScope ?? scope))
    const fencedBlocks = (narrowScope?: VaultScope) => Cache.get(fencedBlockCache, scopeKey(narrowScope ?? scope))
    const diagnostics = (narrowScope?: VaultScope) => Cache.get(diagnosticCache, scopeKey(narrowScope ?? scope))
    const notes = (narrowScope?: VaultScope) => Cache.get(noteCache, scopeKey(narrowScope ?? scope))

    return Vault.of({
      scope,
      tree,
      notes,
      frontmatter,
      headings,
      links,
      tags,
      listItems,
      tasks,
      fencedBlocks,
      diagnostics,
      search: (narrowScope, query) => searchVault({ notes, tasks, headings, links, tags }, narrowScope, query),
      sourceLine: (path, line) => sourceLine(fileContents(tree, path), line),
      sourceExcerpt: (path, position) => sourceLine(fileContents(tree, path), position?.start.line)
    })
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

const notesForScope = (tree: MarkdownTree, scope: VaultScope): Chunk.Chunk<VaultNoteRecord> => {
  let notes = Chunk.empty<VaultNoteRecord>()
  for (const [path, result] of Trie.entries(tree.files)) {
    if (pathMatchesScope(path, scope) && Result.isSuccess(result)) {
      const file = markdownFileAtPath(path, result.success)
      notes = Chunk.append(notes, {
        path,
        file
      })
    }
  }
  return notes
}

const diagnosticsForScope = (tree: MarkdownTree, scope: VaultScope): Chunk.Chunk<VaultDiagnostic> => {
  let diagnostics = Chunk.empty<VaultDiagnostic>()
  for (const [path, result] of Trie.entries(tree.files)) {
    if (pathMatchesScope(path, scope) && Result.isFailure(result)) {
      diagnostics = Chunk.append(diagnostics, { path, message: result.failure.message, cause: result.failure })
    }
  }
  return diagnostics
}

const frontmatterRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultFrontmatterRecord> =>
  Chunk.map(Markdown.getFrontmatter(file), (node) => ({
    path,
    file,
    node,
    value: node.value,
    language: "yaml",
    ...optionalPosition(node.position)
  }))

const headingRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultHeadingRecord> =>
  Chunk.map(Markdown.getHeadings(file), (node) => ({
    path,
    file,
    node,
    depth: node.depth,
    text: Markdown.headingText(node),
    ...optionalPosition(node.position)
  }))

const linkRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultLinkRecord> =>
  Chunk.map(Markdown.getWikilinks(file), (node) => ({
    path,
    file,
    node,
    target: node.target,
    value: node.value,
    original: node.original,
    ...optionalString("alias", node.alias),
    ...optionalString("heading", node.heading),
    ...optionalString("block", node.block),
    ...optionalPosition(node.position)
  }))

const tagRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultTagRecord> =>
  Chunk.map(Markdown.getTags(file), (node) => ({
    path,
    file,
    node,
    value: node.value,
    ...optionalPosition(node.position)
  }))

const listItemRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultListItemRecord> =>
  Chunk.map(Markdown.getListItems(file), (node) => ({
    path,
    file,
    node,
    text: Markdown.listItemText(node),
    ...optionalChecked(node.checked),
    ...optionalPosition(node.position)
  }))

const taskRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultTaskRecord> => {
  const tasks = parsedTasksFromMarkdownFile(file)
  let records = Chunk.empty<VaultTaskRecord>()
  for (const node of Markdown.getTasks(file)) {
    const task = taskForNode(tasks, path, node)
    if (task !== undefined) {
      records = Chunk.append(records, {
        path,
        file,
        node,
        task,
        done: task.done,
        text: task.text,
        fields: task.fields,
        unknownFields: task.unknownFields,
        tags: Chunk.fromIterable(task.tags),
        ...optionalPosition(node.position)
      })
    }
  }
  return records
}

const fencedBlockRecordsForFile = (path: string, file: MarkdownFile): Chunk.Chunk<VaultFencedBlockRecord> =>
  Chunk.map(Markdown.getFencedBlocks(file), (node) => ({
    path,
    file,
    node,
    value: node.value,
    ...optionalString("language", Markdown.fencedBlockLanguage(node)),
    ...optionalString("meta", Markdown.fencedBlockMeta(node)),
    ...optionalPosition(node.position)
  }))

const taskForNode = (tasks: Chunk.Chunk<ParsedTask>, path: string, node: ObsidianListItem): ParsedTask | undefined => {
  const line = node.position?.start.line
  for (const task of tasks) {
    if (task.source.path === path && (line === undefined || task.source.lineNumber === line)) {
      return task
    }
  }
  return undefined
}

const markdownFileAtPath = (path: string, file: MarkdownFile): MarkdownFile =>
  file.path === path ? file : new MarkdownFile({ path, contents: file.contents, mdast: file.mdast })

type SearchSources = {
  readonly notes: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultNoteRecord>>
  readonly tasks: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultTaskRecord>>
  readonly headings: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultHeadingRecord>>
  readonly links: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultLinkRecord>>
  readonly tags: (scope?: VaultScope) => Effect.Effect<Chunk.Chunk<VaultTagRecord>>
}

const searchVault = (
  sources: SearchSources,
  scope: VaultScope,
  query: string
): Effect.Effect<Chunk.Chunk<VaultSearchResult>> =>
  Effect.gen(function* () {
    const needle = Str.toLowerCase(query)
    const results: Array<VaultSearchResult> = []
    const notes = yield* sources.notes(scope)
    const tasks = yield* sources.tasks(scope)
    const headings = yield* sources.headings(scope)
    const links = yield* sources.links(scope)
    const tags = yield* sources.tags(scope)

    for (const note of notes) {
      const title = titleFromPath(note.path)
      if (matches(needle, note.path, title)) {
        results.push({ _tag: "Note", path: note.path, text: title, record: note })
      }
    }
    for (const task of tasks) {
      if (matches(needle, task.text)) {
        results.push({ _tag: "Task", path: task.path, text: task.text, record: task })
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

const scopeKey = (scope: VaultScope): string => Chunk.toReadonlyArray(scope.patterns).join("\u0000")
const scopeFromKey = (key: string): VaultScope =>
  new VaultScope({ patterns: Chunk.fromIterable(key.length === 0 ? [] : key.split("\u0000")) })

const matches = (needle: string, ...values: ReadonlyArray<string | undefined>): boolean => {
  for (const value of values) {
    if (value !== undefined && Str.includes(needle)(Str.toLowerCase(value))) {
      return true
    }
  }
  return false
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
