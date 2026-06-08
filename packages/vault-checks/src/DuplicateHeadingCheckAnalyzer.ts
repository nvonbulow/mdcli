import { Chunk, Context, Effect, Layer } from "effect"
import { fromPath } from "@kb/vault-core"
import { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"
import { isArchivePath, normalizeKey, sortedOtherPaths } from "./CheckAnalyzerUtils"

const analyzeFile = Effect.fnUntraced(function* (path: string) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  const headings = yield* context.vault.headings(fromPath(path))
  for (const heading of headings) {
    if (heading.depth !== 1 || isArchivePath(heading.path)) {
      continue
    }
    const key = normalizeKey(heading.text)
    const matches = context.indexes.activeH1ByKey.get(key) ?? Chunk.empty<string>()
    const related = sortedOtherPaths(matches, heading.path)
    if (related.length > 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "headings",
          severity: "warning",
          path: heading.path,
          message: `Duplicate active H1: ${heading.text}`,
          position: heading.position,
          suggestedFix: "Rename one top-level heading or move one note out of the active namespace.",
          relatedPaths: Chunk.fromIterable(related),
          triggerPath: heading.path
        })
      )
    }
  }

  return findings
})

export class DuplicateHeadingCheckAnalyzer extends Context.Service<DuplicateHeadingCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/DuplicateHeadingCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<DuplicateHeadingCheckAnalyzer> = Layer.succeed(
    DuplicateHeadingCheckAnalyzer,
    DuplicateHeadingCheckAnalyzer.of({ analyzeFile })
  )
}
