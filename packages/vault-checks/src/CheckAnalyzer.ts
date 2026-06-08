import type * as Chunk from "effect/Chunk"
import type * as Effect from "effect/Effect"
import type { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckServiceError } from "./CheckService"

export type CheckAnalyzer = {
  readonly analyzeFile: (path: string) => Effect.Effect<Chunk.Chunk<CheckFinding>, CheckServiceError, CheckContext>
}
