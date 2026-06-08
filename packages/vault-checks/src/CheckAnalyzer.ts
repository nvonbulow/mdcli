import type * as Chunk from "effect/Chunk"
import type * as Effect from "effect/Effect"
import type { MarkdownModel } from "@kb/vault-core"
import type { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckServiceError } from "./CheckService"

export type CheckAnalyzer = {
  readonly analyzeFile: (file: MarkdownModel.MarkdownFile) => Effect.Effect<Chunk.Chunk<CheckFinding>, CheckServiceError, CheckContext>
}
