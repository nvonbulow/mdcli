import { Chunk, Context, Effect, Layer, String as Str, Trie } from "effect"
import { Markdown } from "./markdown/Markdown"
import { MarkdownFile } from "./markdown/MarkdownModel"
import type {
  MarkdownFencedBlock,
  MarkdownHeading,
  MarkdownListItem,
  MarkdownTag,
  MarkdownWikilink,
  RawFrontmatter,
  SourceSpan
} from "./markdown/MarkdownModel"
import { parsedTasksFromMarkdownFile } from "./TaskParser"
import type { ParsedTask } from "./TaskModel"
import { VaultService } from "./VaultService"
import type { MarkdownParseError, VaultIoError } from "./VaultErrors"
import { CatalogSearchResult } from "./CatalogModel"
import type {
  CatalogDiagnostic,
  CatalogFencedBlockRecord,
  CatalogFrontmatterRecord,
  CatalogHeadingRecord,
  CatalogLinkRecord,
  CatalogListItemRecord,
  CatalogNoteRecord,
  CatalogSnapshot,
  CatalogTagRecord,
  CatalogTaskRecord
} from "./CatalogModel"

type CatalogServiceError = MarkdownParseError | VaultIoError

export type CatalogServiceShape = {
  readonly snapshot: (source: string) => Effect.Effect<CatalogSnapshot, CatalogServiceError>
  readonly listNotes: (source: string) => Effect.Effect<Chunk.Chunk<CatalogNoteRecord>, CatalogServiceError>
  readonly listTasks: (source: string) => Effect.Effect<Chunk.Chunk<CatalogTaskRecord>, CatalogServiceError>
  readonly listTags: (source: string) => Effect.Effect<Chunk.Chunk<CatalogTagRecord>, CatalogServiceError>
  readonly search: (
    source: string,
    query: string
  ) => Effect.Effect<Chunk.Chunk<CatalogSearchResult>, CatalogServiceError>
}

export class CatalogService extends Context.Service<CatalogService, CatalogServiceShape>()("@kb/vault/CatalogService") {
  static readonly layerNoDeps: Layer.Layer<CatalogService, never, VaultService> = Layer.effect(
    CatalogService,
    makeCatalogService()
  )

  static readonly layer: Layer.Layer<CatalogService, never, VaultService> = CatalogService.layerNoDeps
}

function makeCatalogService() {
  return Effect.gen(function* () {
    const vault = yield* VaultService
    const snapshot = Effect.fn("CatalogService.snapshot")(function* (source: string) {
      const tree = yield* vault.readMarkdownTree(source)
      const cataloged = Chunk.map(Chunk.fromIterable(Trie.entries(tree.files)), ([path, file]) =>
        catalogParsedFile(path, file)
      )

      return snapshotFromCatalogedFiles(source, cataloged)
    })

    const listNotes = Effect.fn("CatalogService.listNotes")((source: string) =>
      snapshot(source).pipe(Effect.map((catalog) => catalog.notes))
    )

    const listTasks = Effect.fn("CatalogService.listTasks")((source: string) =>
      snapshot(source).pipe(Effect.map((catalog) => catalog.tasks))
    )

    const listTags = Effect.fn("CatalogService.listTags")((source: string) =>
      snapshot(source).pipe(Effect.map((catalog) => catalog.tags))
    )

    const search = Effect.fn("CatalogService.search")((source: string, query: string) =>
      snapshot(source).pipe(Effect.map((catalog) => searchSnapshot(catalog, query)))
    )

    return CatalogService.of({
      snapshot,
      listNotes,
      listTasks,
      listTags,
      search
    })
  })
}

type CatalogedFile = {
  readonly note?: CatalogNoteRecord
  readonly frontmatter: Chunk.Chunk<CatalogFrontmatterRecord>
  readonly headings: Chunk.Chunk<CatalogHeadingRecord>
  readonly links: Chunk.Chunk<CatalogLinkRecord>
  readonly tags: Chunk.Chunk<CatalogTagRecord>
  readonly listItems: Chunk.Chunk<CatalogListItemRecord>
  readonly tasks: Chunk.Chunk<CatalogTaskRecord>
  readonly fencedBlocks: Chunk.Chunk<CatalogFencedBlockRecord>
  readonly diagnostics: Chunk.Chunk<CatalogDiagnostic>
}

const catalogParsedFile = (path: string, file: MarkdownFile): CatalogedFile => {
  const source = sourceFromPath(path)
  const markdownFile =
    file.path === path ? file : new MarkdownFile({ path, contents: file.contents, mdast: file.mdast })
  const frontmatter = Chunk.map(Markdown.getFrontmatter(markdownFile), (record) => frontmatterRecord(source, record))
  const headings = Chunk.map(Markdown.getHeadings(markdownFile), (record) => headingRecord(source, record))
  const links = Chunk.map(Markdown.getWikilinks(markdownFile), (record) => linkRecord(source, record))
  const tags = Chunk.map(Markdown.getTags(markdownFile), (record) => tagRecord(source, record))
  const listItems = Chunk.map(Markdown.getListItems(markdownFile), (record) => listItemRecord(source, record))
  const tasks = Chunk.map(parsedTasksFromMarkdownFile(markdownFile), (record) => taskRecord(source, record))
  const fencedBlocks = Chunk.map(Markdown.getFencedBlocks(markdownFile), (record) => fencedBlockRecord(source, record))

  return {
    note: {
      path: source.path,
      folder: source.folder,
      title: source.title,
      frontmatter,
      headings,
      links,
      tags,
      listItems,
      tasks,
      fencedBlocks
    },
    frontmatter,
    headings,
    links,
    tags,
    listItems,
    tasks,
    fencedBlocks,
    diagnostics: Chunk.empty()
  }
}
const snapshotFromCatalogedFiles = (source: string, files: Chunk.Chunk<CatalogedFile>): CatalogSnapshot => ({
  source,
  notes: Chunk.flatMap(files, (file) => (file.note === undefined ? Chunk.empty() : Chunk.of(file.note))),
  frontmatter: Chunk.flatMap(files, (file) => file.frontmatter),
  headings: Chunk.flatMap(files, (file) => file.headings),
  links: Chunk.flatMap(files, (file) => file.links),
  tags: Chunk.flatMap(files, (file) => file.tags),
  listItems: Chunk.flatMap(files, (file) => file.listItems),
  tasks: Chunk.flatMap(files, (file) => file.tasks),
  fencedBlocks: Chunk.flatMap(files, (file) => file.fencedBlocks),
  diagnostics: Chunk.flatMap(files, (file) => file.diagnostics)
})

type SourceParts = {
  readonly path: string
  readonly folder: string
  readonly title: string
}

const sourceFromPath = (path: string): SourceParts => {
  const lastSlash = path.lastIndexOf("/")
  const folder = lastSlash === -1 ? "" : path.slice(0, lastSlash)
  const fileName = lastSlash === -1 ? path : path.slice(lastSlash + 1)
  const title = Str.endsWith(".md")(fileName) ? fileName.slice(0, -3) : fileName
  return { path, folder, title }
}

const sourceWithSpan = (
  source: SourceParts,
  span: SourceSpan | undefined
): SourceParts & { readonly span?: SourceSpan } => (span === undefined ? source : { ...source, span })

const frontmatterRecord = (source: SourceParts, record: RawFrontmatter): CatalogFrontmatterRecord => ({
  ...sourceWithSpan(source, record.span),
  value: record.value,
  ...(record.language === undefined ? {} : { language: record.language })
})

const headingRecord = (source: SourceParts, record: MarkdownHeading): CatalogHeadingRecord => ({
  ...sourceWithSpan(source, record.span),
  depth: record.depth,
  text: record.text
})

const linkRecord = (source: SourceParts, record: MarkdownWikilink): CatalogLinkRecord => ({
  ...sourceWithSpan(source, record.span),
  target: record.target,
  value: record.value,
  original: record.original,
  ...(record.alias === undefined ? {} : { alias: record.alias }),
  ...(record.heading === undefined ? {} : { heading: record.heading }),
  ...(record.block === undefined ? {} : { block: record.block })
})

const tagRecord = (source: SourceParts, record: MarkdownTag): CatalogTagRecord => ({
  ...sourceWithSpan(source, record.span),
  value: record.value
})

const listItemRecord = (source: SourceParts, record: MarkdownListItem): CatalogListItemRecord => ({
  ...sourceWithSpan(source, record.span),
  text: record.text,
  ...(record.checked === undefined ? {} : { checked: record.checked })
})

const taskRecord = (source: SourceParts, record: ParsedTask): CatalogTaskRecord => ({
  ...source,
  task: record,
  done: record.done,
  text: record.text,
  lineNumber: record.source.lineNumber,
  fields: record.fields,
  unknownFields: record.unknownFields,
  tags: Chunk.fromIterable(record.tags)
})

const fencedBlockRecord = (source: SourceParts, record: MarkdownFencedBlock): CatalogFencedBlockRecord => ({
  ...sourceWithSpan(source, record.span),
  block: record,
  value: record.value,
  ...(record.language === undefined ? {} : { language: record.language }),
  ...(record.meta === undefined ? {} : { meta: record.meta })
})

const searchSnapshot = (snapshot: CatalogSnapshot, query: string): Chunk.Chunk<CatalogSearchResult> => {
  const needle = Str.toLowerCase(query)
  const results: Array<CatalogSearchResult> = []

  for (const note of snapshot.notes) {
    if (matches(needle, note.path, note.title)) {
      results.push(CatalogSearchResult.Note({ ...note, text: note.title, record: note }))
    }
  }

  for (const task of snapshot.tasks) {
    if (matches(needle, task.text)) {
      results.push(CatalogSearchResult.Task({ ...task, text: task.text, record: task }))
    }
  }

  for (const heading of snapshot.headings) {
    if (matches(needle, heading.text)) {
      results.push(CatalogSearchResult.Heading({ ...heading, text: heading.text, record: heading }))
    }
  }

  for (const link of snapshot.links) {
    if (matches(needle, link.value, link.target, link.alias, link.heading, link.block)) {
      results.push(CatalogSearchResult.Link({ ...link, text: link.value, record: link }))
    }
  }

  for (const tag of snapshot.tags) {
    if (matches(needle, tag.value)) {
      results.push(CatalogSearchResult.Tag({ ...tag, text: tag.value, record: tag }))
    }
  }

  return Chunk.fromIterable(results)
}

const matches = (needle: string, ...values: ReadonlyArray<string | undefined>): boolean => {
  for (const value of values) {
    if (value !== undefined && Str.includes(needle)(Str.toLowerCase(value))) {
      return true
    }
  }
  return false
}
