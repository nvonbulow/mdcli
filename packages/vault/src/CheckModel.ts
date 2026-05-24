import { Chunk, Context, Data } from "effect"
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
import type { VaultScope } from "./VaultScope"

export type CheckSeverity = "error" | "warning"

export type CheckCategory = "catalog" | "links" | "headings" | "title-drift" | "archive-headings" | "dump" | "tasks"

export class CheckFinding extends Data.Class<{
  readonly category: CheckCategory
  readonly severity: CheckSeverity
  readonly path: string
  readonly lineNumber?: number
  readonly message: string
  readonly suggestedFix?: string
  readonly relatedPaths?: Chunk.Chunk<string>
  readonly triggerPath?: string
}> {}

export class CheckReport extends Data.Class<{
  readonly scope: VaultScope
  readonly findings: Chunk.Chunk<CheckFinding>
}> {}

export type CheckFile = {
  readonly path: string
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

export type CheckIndexes = {
  readonly notesByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly basenameByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly h1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly activeH1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly archiveH1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
}

export type CheckContextShape = {
  readonly scope: VaultScope
  readonly snapshot: CatalogSnapshot
  readonly files: Chunk.Chunk<CheckFile>
  readonly indexes: CheckIndexes
}

export class CheckContext extends Context.Service<CheckContext, CheckContextShape>()("@kb/vault/CheckContext") {}
