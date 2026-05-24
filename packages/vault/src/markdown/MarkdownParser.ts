import { remarkObsidian } from "@kb/remark-obsidian"
import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { MarkdownFile } from "./MarkdownModel"
import { MarkdownParseError } from "../VaultErrors"

export type MarkdownParserService = {
  readonly parse: (markdown: string) => Effect.Effect<MarkdownFile, MarkdownParseError>
}

export class MarkdownParser extends Context.Service<MarkdownParser, MarkdownParserService>()(
  "@kb/vault/markdown/MarkdownParser"
) {
  static readonly layerNoDeps: Layer.Layer<MarkdownParser> = Layer.succeed(this, makeMarkdownParser())

  static readonly layer: Layer.Layer<MarkdownParser> = this.layerNoDeps
}

function makeMarkdownParser(): MarkdownParserService {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]).use(remarkObsidian)

  const parse = Effect.fn("MarkdownParser.parse")((markdown: string) =>
    Effect.tryPromise({
      try: () =>
        processor.run(processor.parse(markdown)).then(
          (mdast) =>
            new MarkdownFile({
              contents: markdown,
              mdast: mdast as Root
            })
        ),
      catch: (cause) =>
        new MarkdownParseError({
          message: messageFromCause(cause),
          input: markdown
        })
    })
  )

  return { parse }
}

const messageFromCause = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))
