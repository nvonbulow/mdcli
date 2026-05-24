import type { MarkdownFencedBlock, SourceSpan } from "./markdown/MarkdownModel"
import type { ParsedTask } from "./TaskModel"
import type { MarkdownParseError } from "./VaultErrors"

export type CatalogSourceReference = {
  readonly path: string
  readonly folder: string
  readonly title: string
  readonly span?: SourceSpan
}

export type CatalogNoteRecord = {
  readonly path: string
  readonly folder: string
  readonly title: string
  readonly frontmatter: ReadonlyArray<CatalogFrontmatterRecord>
  readonly headings: ReadonlyArray<CatalogHeadingRecord>
  readonly links: ReadonlyArray<CatalogLinkRecord>
  readonly tags: ReadonlyArray<CatalogTagRecord>
  readonly listItems: ReadonlyArray<CatalogListItemRecord>
  readonly tasks: ReadonlyArray<CatalogTaskRecord>
  readonly fencedBlocks: ReadonlyArray<CatalogFencedBlockRecord>
}

export type CatalogFrontmatterRecord = CatalogSourceReference & {
  readonly value: string
  readonly language?: string
}

export type CatalogHeadingRecord = CatalogSourceReference & {
  readonly depth: number
  readonly text: string
}

export type CatalogLinkRecord = CatalogSourceReference & {
  readonly target: string
  readonly value: string
  readonly original: string
  readonly alias?: string
  readonly heading?: string
  readonly block?: string
}

export type CatalogTagRecord = CatalogSourceReference & {
  readonly value: string
}

export type CatalogListItemRecord = CatalogSourceReference & {
  readonly text: string
  readonly checked?: boolean
}

export type CatalogTaskRecord = CatalogSourceReference & {
  readonly task: ParsedTask
  readonly done: boolean
  readonly text: string
  readonly lineNumber: number
  readonly fields: Readonly<Record<string, string>>
  readonly unknownFields: Readonly<Record<string, string>>
  readonly tags: ReadonlyArray<string>
}

export type CatalogFencedBlockRecord = CatalogSourceReference & {
  readonly block: MarkdownFencedBlock
  readonly value: string
  readonly language?: string
  readonly meta?: string
}

export type CatalogDiagnostic = {
  readonly path: string
  readonly folder: string
  readonly title: string
  readonly message: string
  readonly cause: MarkdownParseError
}

export type CatalogSnapshot = {
  readonly source: string
  readonly notes: ReadonlyArray<CatalogNoteRecord>
  readonly frontmatter: ReadonlyArray<CatalogFrontmatterRecord>
  readonly headings: ReadonlyArray<CatalogHeadingRecord>
  readonly links: ReadonlyArray<CatalogLinkRecord>
  readonly tags: ReadonlyArray<CatalogTagRecord>
  readonly listItems: ReadonlyArray<CatalogListItemRecord>
  readonly tasks: ReadonlyArray<CatalogTaskRecord>
  readonly fencedBlocks: ReadonlyArray<CatalogFencedBlockRecord>
  readonly diagnostics: ReadonlyArray<CatalogDiagnostic>
}

export type CatalogSearchKind = "note" | "task" | "heading" | "link" | "tag"

export type CatalogSearchResult = CatalogSourceReference & {
  readonly kind: CatalogSearchKind
  readonly text: string
  readonly record: CatalogNoteRecord | CatalogTaskRecord | CatalogHeadingRecord | CatalogLinkRecord | CatalogTagRecord
}
