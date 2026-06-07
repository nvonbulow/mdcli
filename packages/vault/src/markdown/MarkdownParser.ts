import { MarkdownProcessor, type MarkdownParseError } from "@kb/markdown-ast"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { MarkdownFile } from "./MarkdownModel"

export type MarkdownParserService = {
  readonly parse: (markdown: string) => Effect.Effect<MarkdownFile, MarkdownParseError>
}

export class MarkdownParser extends Context.Service<MarkdownParser, MarkdownParserService>()(
  "@kb/vault-core/markdown/MarkdownParser"
) {
  static readonly layerNoDeps: Layer.Layer<MarkdownParser, never, MarkdownProcessor> = Layer.effect(
    this,
    makeMarkdownParser()
  )

  static readonly layer: Layer.Layer<MarkdownParser> = this.layerNoDeps.pipe(Layer.provide(MarkdownProcessor.layer))
}

function makeMarkdownParser(): Effect.Effect<MarkdownParserService, never, MarkdownProcessor> {
  return Effect.gen(function* () {
    const processor = yield* MarkdownProcessor

    const parse = Effect.fn("MarkdownParser.parse")((markdown: string) =>
      Effect.map(
        processor.parse(markdown),
        (mdast) =>
          new MarkdownFile({
            contents: markdown,
            mdast
          })
      )
    )

    return { parse }
  })
}
