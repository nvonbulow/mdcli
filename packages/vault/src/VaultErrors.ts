import { Schema } from "effect"
import type { MarkdownParseError, MarkdownStringifyError } from "@kb/markdown-ast"

export class VaultIoError extends Schema.TaggedErrorClass<VaultIoError>("@kb/vault-core/VaultIoError")("VaultIoError", {
  operation: Schema.String,
  path: Schema.optionalKey(Schema.String),
  message: Schema.String
}) {}

export { MarkdownParseError, MarkdownStringifyError } from "@kb/markdown-ast"

export type VaultError = VaultIoError | MarkdownParseError | MarkdownStringifyError
