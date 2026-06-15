import { Chunk, Context, Data } from "effect"
import type { Vault, VaultScope } from "@kb/vault-core"
import type { VaultTaskRecord } from "@kb/vault-tasks"
import { sourceLine as vaultSourceLine } from "@kb/vault-core"
import type * as VaultCore from "@kb/vault-core"

type SourcePosition = VaultCore.MarkdownModel.SourcePosition

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
  readonly vault: Vault
  readonly findings: Chunk.Chunk<CheckFinding>
}> {}

export const sourceLine = (report: CheckReport, finding: CheckFinding): string | undefined =>
  vaultSourceLine(report.vault, finding.path, finding.position?.start.line ?? 0)

export type CheckIndexes = {
  readonly notesByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly basenameByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly h1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly activeH1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
  readonly archiveH1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>
}

export interface CheckContext {
  readonly scope: VaultScope
  readonly vault: Vault
  readonly selected: (path: string) => boolean
  readonly indexes: CheckIndexes
  readonly taskRecords: Chunk.Chunk<VaultTaskRecord>
}

export class CheckContext extends Context.Service<CheckContext, CheckContext>()("@kb/vault-checks/CheckContext") {}
