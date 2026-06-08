import { Chunk, Context, Effect, Layer } from "effect"
import { fromPath } from "@kb/vault-core"
import { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"

const analyzeFile = Effect.fnUntraced(function* (path: string) {
  const context = yield* CheckContext
  const diagnostics = yield* context.vault.diagnostics(fromPath(path))
  return Chunk.map(
    diagnostics,
    (diagnostic) =>
      new CheckFinding({
        category: "catalog",
        severity: "error",
        path: diagnostic.path,
        message: diagnostic.message,
        suggestedFix: "Fix the markdown parse error or remove the unreadable file.",
        triggerPath: diagnostic.path
      })
  )
})

export class VaultDiagnosticsCheckAnalyzer extends Context.Service<VaultDiagnosticsCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/VaultDiagnosticsCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<VaultDiagnosticsCheckAnalyzer> = Layer.succeed(
    VaultDiagnosticsCheckAnalyzer,
    VaultDiagnosticsCheckAnalyzer.of({ analyzeFile })
  )
}
