import { Chunk, Context, Effect, Layer } from "effect"
import type { AnyNode } from "@kb/markdown-ast"
import { Markdown, type MarkdownModel } from "@kb/vault-core"
import { CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"
import { basename } from "./CheckAnalyzerUtils"

const analyzeFile = Effect.fnUntraced(function* (file: MarkdownModel.MarkdownFile) {
  const path = file.path ?? ""
  if (basename(path) !== "dump.md") {
    return Chunk.empty<CheckFinding>()
  }

  for (const node of Markdown.root(file).children) {
    if (isAllowedDumpTopLevelNode(node)) {
      continue
    }
    return Chunk.of(
      new CheckFinding({
        category: "dump",
        severity: "warning",
        path,
        position: node.position,
        message: "dump.md contains stranded non-heading content",
        suggestedFix: "Move or archive stranded dump content.",
        triggerPath: path
      })
    )
  }

  return Chunk.empty<CheckFinding>()
})

const isAllowedDumpTopLevelNode = (node: AnyNode): boolean =>
  node._tag === "YamlFrontmatterNode" || node._tag === "HeadingNode"

export class DumpInboxCheckAnalyzer extends Context.Service<DumpInboxCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/DumpInboxCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<DumpInboxCheckAnalyzer> = Layer.succeed(
    DumpInboxCheckAnalyzer,
    DumpInboxCheckAnalyzer.of({ analyzeFile })
  )
}
