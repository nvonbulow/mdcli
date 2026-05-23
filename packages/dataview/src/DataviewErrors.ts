import { Schema } from "effect"

export class DataviewParseError extends Schema.TaggedErrorClass<DataviewParseError>("@kb/dataview/DataviewParseError")(
  "ParseError",
  {
    input: Schema.String,
    message: Schema.String,
    line: Schema.UndefinedOr(Schema.Number)
  }
) {}

export class DataviewEvaluateError extends Schema.TaggedErrorClass<DataviewEvaluateError>(
  "@kb/dataview/DataviewEvaluateError"
)("EvaluateError", {
  message: Schema.String
}) {}

export class DataviewRenderError extends Schema.TaggedErrorClass<DataviewRenderError>(
  "@kb/dataview/DataviewRenderError"
)("RenderError", {
  message: Schema.String,
  format: Schema.optionalKey(Schema.String)
}) {}

export class DataviewMarkdownBlockRenderError extends Schema.TaggedErrorClass<DataviewMarkdownBlockRenderError>(
  "@kb/dataview/DataviewMarkdownBlockRenderError"
)("MarkdownBlockRenderError", {
  message: Schema.String,
  block: Schema.optionalKey(Schema.String),
  line: Schema.optionalKey(Schema.Number)
}) {}

export type DataviewError =
  | DataviewParseError
  | DataviewEvaluateError
  | DataviewRenderError
  | DataviewMarkdownBlockRenderError
