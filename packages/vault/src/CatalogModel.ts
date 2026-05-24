import { Chunk, Data } from "effect"
import type { MarkdownFencedBlock, SourceSpan } from "./markdown/MarkdownModel"
import type { ParsedTask } from "./TaskModel"
import type { MarkdownParseError } from "./VaultErrors"
import type { VaultScope } from "./VaultScope"

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
  readonly frontmatter: Chunk.Chunk<CatalogFrontmatterRecord>
  readonly headings: Chunk.Chunk<CatalogHeadingRecord>
  readonly links: Chunk.Chunk<CatalogLinkRecord>
  readonly tags: Chunk.Chunk<CatalogTagRecord>
  readonly listItems: Chunk.Chunk<CatalogListItemRecord>
  readonly tasks: Chunk.Chunk<CatalogTaskRecord>
  readonly fencedBlocks: Chunk.Chunk<CatalogFencedBlockRecord>
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
  readonly tags: Chunk.Chunk<string>
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
  readonly scope: VaultScope
  readonly notes: Chunk.Chunk<CatalogNoteRecord>
  readonly frontmatter: Chunk.Chunk<CatalogFrontmatterRecord>
  readonly headings: Chunk.Chunk<CatalogHeadingRecord>
  readonly links: Chunk.Chunk<CatalogLinkRecord>
  readonly tags: Chunk.Chunk<CatalogTagRecord>
  readonly listItems: Chunk.Chunk<CatalogListItemRecord>
  readonly tasks: Chunk.Chunk<CatalogTaskRecord>
  readonly fencedBlocks: Chunk.Chunk<CatalogFencedBlockRecord>
  readonly diagnostics: Chunk.Chunk<CatalogDiagnostic>
}

export type CatalogSearchResult = Data.TaggedEnum<{
  readonly Note: CatalogSourceReference & {
    readonly text: string
    readonly record: CatalogNoteRecord
  }
  readonly Task: CatalogSourceReference & {
    readonly text: string
    readonly record: CatalogTaskRecord
  }
  readonly Heading: CatalogSourceReference & {
    readonly text: string
    readonly record: CatalogHeadingRecord
  }
  readonly Link: CatalogSourceReference & {
    readonly text: string
    readonly record: CatalogLinkRecord
  }
  readonly Tag: CatalogSourceReference & {
    readonly text: string
    readonly record: CatalogTagRecord
  }
}>
export const CatalogSearchResult = Data.taggedEnum<CatalogSearchResult>()
