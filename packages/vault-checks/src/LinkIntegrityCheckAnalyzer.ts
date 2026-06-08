import { Chunk, Context, Effect, Layer } from "effect"
import { linkRecordsForFile, type MarkdownModel } from "@kb/vault-core"
import { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"
import { linkFindingKey, matchingPaths } from "./CheckAnalyzerUtils"

const analyzeFile = Effect.fnUntraced(function* (file: MarkdownModel.MarkdownFile) {
  const context = yield* CheckContext
  const path = file.path ?? ""
  let findings = Chunk.empty<CheckFinding>()
  const seen = new Set<string>()

  for (const link of linkRecordsForFile(path, file)) {
    const matches = matchingPaths(
      context.indexes.notesByKey,
      context.indexes.basenameByKey,
      context.indexes.h1ByKey,
      link.path,
      link.target
    )
    if (matches.length === 0) {
      const key = linkFindingKey(link, "error")
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "links",
          severity: "error",
          path: link.path,
          message: `Broken link: ${link.original}`,
          position: link.position,
          suggestedFix: `Create note "${link.target}" or update the wikilink target.`,
          triggerPath: link.path
        })
      )
    } else if (matches.length > 1) {
      const key = linkFindingKey(link, "warning")
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "links",
          severity: "warning",
          path: link.path,
          message: `Ambiguous link: ${link.original}`,
          position: link.position,
          suggestedFix: "Use a path-qualified wikilink; preserve the alias with [[path/to/note|alias]] if needed.",
          relatedPaths: Chunk.fromIterable(matches.filter((path) => path !== link.path)),
          triggerPath: link.path
        })
      )
    }
  }

  return findings
})

export class LinkIntegrityCheckAnalyzer extends Context.Service<LinkIntegrityCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/LinkIntegrityCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<LinkIntegrityCheckAnalyzer> = Layer.succeed(
    LinkIntegrityCheckAnalyzer,
    LinkIntegrityCheckAnalyzer.of({ analyzeFile })
  )
}
