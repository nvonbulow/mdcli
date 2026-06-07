import { Chunk, Context, Data } from "effect"
import type { SourcePosition } from "./markdown/MarkdownModel"
import type { VaultShape } from "./Vault"
import type { VaultScope } from "./VaultScope"

export type CheckSeverity = "error" | "warning"

export type CheckCategory = "catalog" | "links" | "headings" | "title-drift" | "archive-headings" | "dump" | "tasks"

export class CheckFinding extends Data.Class<{
  readonly category: CheckCategory
  readonly severity: CheckSeverity
  readonly path: string
  readonly position?: SourcePosition | undefined
  readonly message: string
  readonly suggestedFix?: string | undefined
  readonly relatedPaths?: Chunk.Chunk<string> | undefined
  readonly triggerPath?: string | undefined
}> {}

export class CheckReport extends Data.Class<{
  readonly scope: VaultScope
  readonly vault: VaultShape
  readonly findings: Chunk.Chunk<CheckFinding>
}> {}

export const sourceLine = (report: CheckReport, finding: CheckFinding): string | undefined =>
  report.vault.sourceLine(finding.path, finding.position?.start.line ?? 0)

export type CheckIndexes = {
  readonly notesByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly basenameByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly h1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly activeH1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly archiveH1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
}

export type CheckContextShape = {
  readonly scope: VaultScope
  readonly vault: VaultShape
  readonly selected: (path: string) => boolean
  readonly indexes: CheckIndexes
}

export class CheckContext extends Context.Service<CheckContext, CheckContextShape>()("@kb/vault-core/CheckContext") {}
