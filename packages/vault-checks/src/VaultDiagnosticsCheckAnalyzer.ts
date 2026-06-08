import { Chunk, Context, Effect, Layer } from "effect"
import type { MarkdownModel } from "@kb/vault-core"
import type { CheckAnalyzer } from "./CheckAnalyzer"
import type { CheckFinding } from "./CheckModel"

const analyzeFile = Effect.fnUntraced(function* (_file: MarkdownModel.MarkdownFile) {
  return Chunk.empty<CheckFinding>()
})

export class VaultDiagnosticsCheckAnalyzer extends Context.Service<VaultDiagnosticsCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/VaultDiagnosticsCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<VaultDiagnosticsCheckAnalyzer> = Layer.succeed(
    VaultDiagnosticsCheckAnalyzer,
    VaultDiagnosticsCheckAnalyzer.of({ analyzeFile })
  )
}
