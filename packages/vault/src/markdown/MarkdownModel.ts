import { Schema } from "effect"

export class SourceSpan extends Schema.Class<SourceSpan>("@kb/vault/markdown/SourceSpan")({
  start: Schema.Number,
  end: Schema.Number
}) {}

export class RawFrontmatter extends Schema.Class<RawFrontmatter>("@kb/vault/markdown/RawFrontmatter")({
  value: Schema.String,
  language: Schema.optionalKey(Schema.String),
  span: Schema.optionalKey(SourceSpan)
}) {}

export class MarkdownHeading extends Schema.Class<MarkdownHeading>("@kb/vault/markdown/MarkdownHeading")({
  depth: Schema.Number,
  text: Schema.String,
  span: Schema.optionalKey(SourceSpan)
}) {}

export class MarkdownWikilink extends Schema.Class<MarkdownWikilink>("@kb/vault/markdown/MarkdownWikilink")({
  target: Schema.String,
  value: Schema.String,
  original: Schema.String,
  alias: Schema.optionalKey(Schema.String),
  heading: Schema.optionalKey(Schema.String),
  block: Schema.optionalKey(Schema.String),
  span: Schema.optionalKey(SourceSpan)
}) {}

export class MarkdownInlineField extends Schema.Class<MarkdownInlineField>("@kb/vault/markdown/MarkdownInlineField")({
  key: Schema.String,
  value: Schema.String,
  original: Schema.String,
  valueStart: Schema.Number,
  valueEnd: Schema.Number,
  span: SourceSpan
}) {}

export class MarkdownTag extends Schema.Class<MarkdownTag>("@kb/vault/markdown/MarkdownTag")({
  value: Schema.String,
  span: Schema.optionalKey(SourceSpan)
}) {}

export class MarkdownListItem extends Schema.Class<MarkdownListItem>("@kb/vault/markdown/MarkdownListItem")({
  text: Schema.String,
  checked: Schema.optionalKey(Schema.Boolean),
  span: Schema.optionalKey(SourceSpan)
}) {}

export class MarkdownTask extends Schema.Class<MarkdownTask>("@kb/vault/markdown/MarkdownTask")({
  done: Schema.Boolean,
  text: Schema.String,
  fields: Schema.Array(MarkdownInlineField),
  tags: Schema.Array(MarkdownTag),
  span: Schema.optionalKey(SourceSpan)
}) {}

export class MarkdownFencedBlock extends Schema.Class<MarkdownFencedBlock>("@kb/vault/markdown/MarkdownFencedBlock")({
  language: Schema.optionalKey(Schema.String),
  meta: Schema.optionalKey(Schema.String),
  value: Schema.String,
  span: Schema.optionalKey(SourceSpan)
}) {}

export class MarkdownFile extends Schema.Class<MarkdownFile>("@kb/vault/markdown/MarkdownFile")({
  contents: Schema.String,
  mdast: Schema.Unknown
}) {}
