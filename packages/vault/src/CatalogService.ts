import { Context, Effect, Layer, String as Str } from "effect"
import { Markdown } from "./markdown/Markdown"
import { MarkdownParser } from "./markdown/MarkdownParser"
import type {
  MarkdownFile,
  MarkdownFencedBlock,
  MarkdownHeading,
  MarkdownListItem,
  MarkdownTag,
  MarkdownWikilink,
  RawFrontmatter,
  SourceSpan
} from "./markdown/MarkdownModel"
import { parsedTasksFromMarkdown } from "./TaskMarkdownParser"
import type { ParsedTask } from "./TaskModel"
import { VaultService } from "./VaultService"
import type { VaultIoError, MarkdownParseError } from "./VaultErrors"
import type {
  CatalogDiagnostic,
  CatalogFencedBlockRecord,
  CatalogFrontmatterRecord,
  CatalogHeadingRecord,
  CatalogLinkRecord,
  CatalogListItemRecord,
  CatalogNoteRecord,
  CatalogSearchResult,
  CatalogSnapshot,
  CatalogTagRecord,
  CatalogTaskRecord
} from "./CatalogModel"

export type CatalogServiceShape = {
  readonly snapshot: (source: string) => Effect.Effect<CatalogSnapshot, VaultIoError>
  readonly listNotes: (source: string) => Effect.Effect<ReadonlyArray<CatalogNoteRecord>, VaultIoError>
  readonly listTasks: (source: string) => Effect.Effect<ReadonlyArray<CatalogTaskRecord>, VaultIoError>
  readonly listTags: (source: string) => Effect.Effect<ReadonlyArray<CatalogTagRecord>, VaultIoError>
  readonly search: (source: string, query: string) => Effect.Effect<ReadonlyArray<CatalogSearchResult>, VaultIoError>
}

export class CatalogService extends Context.Service<CatalogService, CatalogServiceShape>()("@kb/vault/CatalogService") {
  static readonly layerNoDeps: Layer.Layer<CatalogService, never, VaultService | MarkdownParser> = Layer.effect(
    CatalogService,
    makeCatalogService()
  )

  static readonly layer: Layer.Layer<CatalogService, never, VaultService | MarkdownParser> = CatalogService.layerNoDeps
}

function makeCatalogService() {
  return Effect.gen(function* () {
    const vault = yield* VaultService
    const parser = yield* MarkdownParser

    const snapshot = Effect.fn("CatalogService.snapshot")(function* (source: string) {
      const files = yield* vault.readMarkdownTree(source)
      const sortedFiles = [...files].sort((left, right) => left.path.localeCompare(right.path))
      const cataloged = yield* Effect.forEach(sortedFiles, (file) =>
        parser.parse(file.contents).pipe(
          Effect.match({
            onFailure: (cause) => catalogParseFailure(file.path, cause),
            onSuccess: (parsed) => catalogParsedFile(file.path, file.contents, parsed)
          })
        )
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
  readonly frontmatter: ReadonlyArray<CatalogFrontmatterRecord>
  readonly headings: ReadonlyArray<CatalogHeadingRecord>
  readonly links: ReadonlyArray<CatalogLinkRecord>
  readonly tags: ReadonlyArray<CatalogTagRecord>
  readonly listItems: ReadonlyArray<CatalogListItemRecord>
  readonly tasks: ReadonlyArray<CatalogTaskRecord>
  readonly fencedBlocks: ReadonlyArray<CatalogFencedBlockRecord>
  readonly diagnostics: ReadonlyArray<CatalogDiagnostic>
}

const catalogParsedFile = (path: string, contents: string, file: MarkdownFile): CatalogedFile => {
  const source = sourceFromPath(path)
  const frontmatter = Markdown.getFrontmatter(file).map((record) => frontmatterRecord(source, record))
  const headings = Markdown.getHeadings(file).map((record) => headingRecord(source, record))
  const links = Markdown.getWikilinks(file).map((record) => linkRecord(source, record))
  const tags = Markdown.getTags(file).map((record) => tagRecord(source, record))
  const listItems = Markdown.getListItems(file).map((record) => listItemRecord(source, record))
  const tasks = parsedTasksFromMarkdown(Markdown.getTasks(file), contents, path).map((record) =>
    taskRecord(source, record)
  )
  const fencedBlocks = Markdown.getFencedBlocks(file).map((record) => fencedBlockRecord(source, record))

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
    diagnostics: []
  }
}

const catalogParseFailure = (path: string, cause: MarkdownParseError): CatalogedFile => {
  const source = sourceFromPath(path)
  return {
    frontmatter: [],
    headings: [],
    links: [],
    tags: [],
    listItems: [],
    tasks: [],
    fencedBlocks: [],
    diagnostics: [
      {
        path: source.path,
        folder: source.folder,
        title: source.title,
        message: cause.message,
        cause
      }
    ]
  }
}

const snapshotFromCatalogedFiles = (source: string, files: ReadonlyArray<CatalogedFile>): CatalogSnapshot => ({
  source,
  notes: files.flatMap((file) => (file.note === undefined ? [] : [file.note])),
  frontmatter: files.flatMap((file) => file.frontmatter),
  headings: files.flatMap((file) => file.headings),
  links: files.flatMap((file) => file.links),
  tags: files.flatMap((file) => file.tags),
  listItems: files.flatMap((file) => file.listItems),
  tasks: files.flatMap((file) => file.tasks),
  fencedBlocks: files.flatMap((file) => file.fencedBlocks),
  diagnostics: files.flatMap((file) => file.diagnostics)
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
  tags: record.tags
})

const fencedBlockRecord = (source: SourceParts, record: MarkdownFencedBlock): CatalogFencedBlockRecord => ({
  ...sourceWithSpan(source, record.span),
  block: record,
  value: record.value,
  ...(record.language === undefined ? {} : { language: record.language }),
  ...(record.meta === undefined ? {} : { meta: record.meta })
})

const searchSnapshot = (snapshot: CatalogSnapshot, query: string): ReadonlyArray<CatalogSearchResult> => {
  const needle = Str.toLowerCase(query)
  const results: Array<CatalogSearchResult> = []

  for (const note of snapshot.notes) {
    if (matches(needle, note.path, note.title)) {
      results.push({ ...note, kind: "note", text: note.title, record: note })
    }
  }

  for (const task of snapshot.tasks) {
    if (matches(needle, task.text)) {
      results.push({ ...task, kind: "task", text: task.text, record: task })
    }
  }

  for (const heading of snapshot.headings) {
    if (matches(needle, heading.text)) {
      results.push({ ...heading, kind: "heading", text: heading.text, record: heading })
    }
  }

  for (const link of snapshot.links) {
    if (matches(needle, link.value, link.target, link.alias, link.heading, link.block)) {
      results.push({ ...link, kind: "link", text: link.value, record: link })
    }
  }

  for (const tag of snapshot.tags) {
    if (matches(needle, tag.value)) {
      results.push({ ...tag, kind: "tag", text: tag.value, record: tag })
    }
  }

  return results
}

const matches = (needle: string, ...values: ReadonlyArray<string | undefined>): boolean => {
  for (const value of values) {
    if (value !== undefined && Str.includes(needle)(Str.toLowerCase(value))) {
      return true
    }
  }
  return false
}
