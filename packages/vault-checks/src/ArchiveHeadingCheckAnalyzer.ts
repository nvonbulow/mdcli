import { Chunk, Context, Effect, Layer } from "effect"
import { fromPath } from "@kb/vault-core"
import { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"
import { isArchivePath, normalizeKey, sortedPaths } from "./CheckAnalyzerUtils"

const analyzeFile = Effect.fnUntraced(function* (path: string) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  const headings = yield* context.vault.headings(fromPath(path))
  for (const heading of headings) {
    if (heading.depth !== 1) {
      continue
    }
    const key = normalizeKey(heading.text)
    const related = isArchivePath(heading.path)
      ? sortedPaths(context.indexes.activeH1ByKey.get(key) ?? Chunk.empty<string>())
      : sortedPaths(context.indexes.archiveH1ByKey.get(key) ?? Chunk.empty<string>())
    if (related.length > 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "archive-headings",
          severity: "error",
          path: heading.path,
          message: `Archive H1 collision: ${heading.text}`,
          position: heading.position,
          suggestedFix: "Rename the archive heading to a unique archived title.",
          relatedPaths: Chunk.fromIterable(related),
          triggerPath: heading.path
        })
      )
    }
  }

  return findings
})

export class ArchiveHeadingCheckAnalyzer extends Context.Service<ArchiveHeadingCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/ArchiveHeadingCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<ArchiveHeadingCheckAnalyzer> = Layer.succeed(
    ArchiveHeadingCheckAnalyzer,
    ArchiveHeadingCheckAnalyzer.of({ analyzeFile })
  )
}
