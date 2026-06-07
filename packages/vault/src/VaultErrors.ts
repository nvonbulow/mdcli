import { Schema } from "effect"
import type { MarkdownParseError, MarkdownStringifyError } from "@kb/markdown-ast"
import { DashboardName } from "./DashboardModel"
import { TaskSource } from "./TaskModel"

export class VaultIoError extends Schema.TaggedErrorClass<VaultIoError>("@kb/vault-core/VaultIoError")("VaultIoError", {
  operation: Schema.String,
  path: Schema.optionalKey(Schema.String),
  message: Schema.String
}) {}

export class TaskParseError extends Schema.TaggedErrorClass<TaskParseError>("@kb/vault-core/TaskParseError")(
  "TaskParseError",
  {
    message: Schema.String,
    input: Schema.optionalKey(Schema.String),
    source: Schema.optionalKey(TaskSource)
  }
) {}

export { MarkdownParseError, MarkdownStringifyError } from "@kb/markdown-ast"

export class DashboardRenderError extends Schema.TaggedErrorClass<DashboardRenderError>(
  "@kb/vault-core/DashboardRenderError"
)("DashboardRenderError", {
  message: Schema.String,
  name: Schema.optionalKey(DashboardName)
}) {}

export type VaultError = VaultIoError | TaskParseError | DashboardRenderError | MarkdownParseError | MarkdownStringifyError
