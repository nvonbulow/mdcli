import { Chunk, Context, Effect, Layer } from "effect"
import {
  frontmatterRecordsForFile,
  headingRecordsForFile,
  noteRecordsForFile,
  type MarkdownModel
} from "@kb/vault-core"
import { CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"
import { firstDepthOneHeading, normalizeKey, titleFromPath } from "./CheckAnalyzerUtils"

const analyzeFile = Effect.fnUntraced(function* (file: MarkdownModel.MarkdownFile) {
  const path = file.path ?? ""
  let findings = Chunk.empty<CheckFinding>()
  const notes = noteRecordsForFile(path, file)
  const headings = headingRecordsForFile(path, file)
  const frontmatter = frontmatterRecordsForFile(path, file)

  for (const note of notes) {
    const titleKey = normalizeKey(titleFromPath(note.path))
    const firstH1 = firstDepthOneHeading(headings, note.path)
    const isSourceCopyNote = Chunk.some(
      frontmatter,
      (record) => record.path === note.path && stringProperty(record.value, "type") === "source-copy"
    )

    if (firstH1 !== undefined && !isSourceCopyNote && normalizeKey(firstH1.text) !== titleKey) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "title-drift",
          severity: "warning",
          path: firstH1.path,
          message: `H1 does not match note title: ${firstH1.text}`,
          position: firstH1.position,
          suggestedFix: "Update the H1 or frontmatter title to match the note basename.",
          triggerPath: note.path
        })
      )
    }

    for (const record of Chunk.filter(frontmatter, (record) => record.path === note.path)) {
      const title = stringProperty(record.value, "title")
      if (title !== undefined && title.length > 0 && normalizeKey(title) !== titleKey) {
        findings = Chunk.append(
          findings,
          new CheckFinding({
            category: "title-drift",
            severity: "warning",
            path: record.path,
            message: `Frontmatter title does not match note title: ${title}`,
            position: record.position,
            suggestedFix: "Update the H1 or frontmatter title to match the note basename.",
            triggerPath: note.path
          })
        )
      }
    }
  }

  return findings
})

const stringProperty = (value: unknown, key: string): string | undefined => {
  if (value === null || typeof value !== "object") {
    return undefined
  }
  const property = (value as Record<string, unknown>)[key]
  return typeof property === "string" ? property : undefined
}

export class TitleDriftCheckAnalyzer extends Context.Service<TitleDriftCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/TitleDriftCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<TitleDriftCheckAnalyzer> = Layer.succeed(
    TitleDriftCheckAnalyzer,
    TitleDriftCheckAnalyzer.of({ analyzeFile })
  )
}
