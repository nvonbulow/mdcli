import { scanInlineFields, stripInlineFields } from "@kb/remark-obsidian"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { TaskParseError } from "./VaultErrors"

export type InlineFieldParserService = {
  readonly parse: (lineText: string) => Effect.Effect<Readonly<Record<string, string>>, TaskParseError>
  readonly strip: (lineText: string) => Effect.Effect<string, TaskParseError>
}
const parse = Effect.fn("InlineFieldParser.parse")(function* (lineText: string) {
  const fields: Record<string, string> = {}
  for (const field of scanInlineFields(lineText)) {
    fields[field.key] = field.value
  }
  return fields
})

const strip = Effect.fn("InlineFieldParser.strip")(function* (lineText: string) {
  return stripInlineFields(lineText)
})

export class InlineFieldParser extends Context.Service<InlineFieldParser, InlineFieldParserService>()(
  "@kb/vault/InlineFieldParser"
) {
  static readonly layerNoDeps: Layer.Layer<InlineFieldParser> = Layer.effect(
    this,
    Effect.succeed(this.of({ parse, strip }))
  )
}
