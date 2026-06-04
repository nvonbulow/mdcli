import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { MarkdownParseError, MarkdownStringifyError, TaskParseError, VaultIoError } from "@kb/vault"
import type { DataviewEvaluateError, DataviewParseError } from "./DataviewAst"
import type { DataviewRenderError } from "./DataviewErrors"
import { DataviewProgram } from "./DataviewProgram"
import { DataviewRenderer } from "./DataviewRenderer"
import { MarkdownFenceParser, type DataviewMarkdownRenderError, type MarkdownFencePart } from "./MarkdownFenceParser"

export type MarkdownDataviewRendererService = {
  readonly renderDocument: (
    markdown: string
  ) => Effect.Effect<
    string,
    | DataviewMarkdownRenderError
    | DataviewRenderError
    | DataviewParseError
    | DataviewEvaluateError
    | VaultIoError
    | TaskParseError
    | MarkdownParseError
    | MarkdownStringifyError
  >
}

export class MarkdownDataviewRenderer extends Context.Service<
  MarkdownDataviewRenderer,
  MarkdownDataviewRendererService
>()("@kb/dataview/MarkdownDataviewRenderer") {
  static readonly layerNoDeps: Layer.Layer<
    MarkdownDataviewRenderer,
    never,
    MarkdownFenceParser | DataviewProgram | DataviewRenderer
  > = Layer.effect(
    this,
    Effect.gen(function* () {
      const parser = yield* MarkdownFenceParser
      const program = yield* DataviewProgram
      const renderer = yield* DataviewRenderer
      return MarkdownDataviewRenderer.of({
        renderDocument: Effect.fn("MarkdownDataviewRenderer.renderDocument")(function* (markdown: string) {
          const parts = yield* parser.parse(markdown)
          const rendered = yield* Effect.forEach(parts, (part) => renderPart(part, program, renderer), {
            concurrency: 1
          })
          return rendered.join("")
        })
      })
    })
  )
}

const renderPart = (
  part: MarkdownFencePart,
  program: DataviewProgram["Service"],
  renderer: DataviewRenderer["Service"]
): Effect.Effect<
  string,
  DataviewRenderError | DataviewParseError | DataviewEvaluateError | VaultIoError | TaskParseError | MarkdownParseError | MarkdownStringifyError
> => {
  switch (part._tag) {
    case "Markdown":
      return Effect.succeed(part.text)
    case "DataviewFence":
      return program.run(part.query).pipe(
        Effect.flatMap(renderer.render),
        Effect.map((rendered) => (rendered.endsWith("\n") ? rendered : rendered + trailingLineEnding(part.raw)))
      )
  }
}

const trailingLineEnding = (raw: string): string => {
  if (raw.endsWith("\r\n")) {
    return "\r\n"
  }
  if (raw.endsWith("\n")) {
    return "\n"
  }
  return ""
}
