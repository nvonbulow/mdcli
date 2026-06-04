import { remarkPlugin } from "@kb/remark-plugin"
import type { Root as MdastRoot } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import type { Processor } from "unified"
import { unified } from "unified"
import { Context, Effect, Layer, Schema } from "effect"

import { Root } from "./schema.js"
import { markdownStringifyOptions } from "./stringify.js"

type MarkdownUnifiedProcessor = Processor<MdastRoot, MdastRoot, MdastRoot, MdastRoot, string>

export class MarkdownParseError extends Schema.TaggedErrorClass<MarkdownParseError>(
  "@kb/markdown-ast/MarkdownParseError"
)("MarkdownParseError", {
  message: Schema.String,
  input: Schema.optionalKey(Schema.String)
}) {}

export class MarkdownStringifyError extends Schema.TaggedErrorClass<MarkdownStringifyError>(
  "@kb/markdown-ast/MarkdownStringifyError"
)("MarkdownStringifyError", {
  message: Schema.String
}) {}

export type MarkdownProcessorService = {
  readonly parse: (markdown: string) => Effect.Effect<typeof Root.Type, MarkdownParseError>
  readonly stringify: (root: typeof Root.Type) => Effect.Effect<string, MarkdownStringifyError>
}

export class MarkdownProcessor extends Context.Service<MarkdownProcessor, MarkdownProcessorService>()(
  "@kb/markdown-ast/MarkdownProcessor"
) {
  static make(processor: MarkdownUnifiedProcessor = defaultProcessor()): MarkdownProcessorService {
    return makeMarkdownProcessor(processor)
  }

  static makeLayer(processor?: MarkdownUnifiedProcessor): Layer.Layer<MarkdownProcessor> {
    return Layer.succeed(this, this.make(processor))
  }

  static readonly layer: Layer.Layer<MarkdownProcessor> = this.makeLayer()
}

function defaultProcessor(): MarkdownUnifiedProcessor {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkPlugin)
    .use(remarkStringify, markdownStringifyOptions)
}

function makeMarkdownProcessor(processor: MarkdownUnifiedProcessor): MarkdownProcessorService {
  return {
    parse: Effect.fn("MarkdownProcessor.parse")((markdown: string) =>
      Effect.try({
        try: () => processor.runSync(processor.parse(markdown)),
        catch: (cause) => new MarkdownParseError({ message: messageFromCause(cause), input: markdown })
      }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Root)),
        Effect.mapError((cause) =>
          cause instanceof MarkdownParseError
            ? cause
            : new MarkdownParseError({ message: messageFromCause(cause), input: markdown })
        )
      )
    ),
    stringify: Effect.fn("MarkdownProcessor.stringify")((root: typeof Root.Type) =>
      Schema.encodeEffect(Root)(root).pipe(
        Effect.flatMap((encoded) =>
          Effect.try({
            try: () => processor.stringify(encoded as MdastRoot),
            catch: (cause) => new MarkdownStringifyError({ message: messageFromCause(cause) })
          })
        ),
        Effect.mapError((cause) =>
          cause instanceof MarkdownStringifyError
            ? cause
            : new MarkdownStringifyError({ message: messageFromCause(cause) })
        )
      )
    )
  }
}

const messageFromCause = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))
