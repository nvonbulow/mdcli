import { Chunk, Context, Effect, Layer } from "effect"
import { headingRecordsForFile, type MarkdownModel } from "@kb/vault-core"
import { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"
import { isArchivePath, normalizeKey, sortedOtherPaths } from "./CheckAnalyzerUtils"

const analyzeFile = Effect.fnUntraced(function* (file: MarkdownModel.MarkdownFile) {
  const context = yield* CheckContext
  const path = file.path ?? ""
  let findings = Chunk.empty<CheckFinding>()

  for (const heading of headingRecordsForFile(path, file)) {
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
