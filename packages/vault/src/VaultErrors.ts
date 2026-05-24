import { Schema } from "effect"
import { DashboardName } from "./DashboardModel"
import { TaskSource, ValidationProblem } from "./TaskModel"

export class VaultIoError extends Schema.TaggedErrorClass<VaultIoError>("@kb/vault/VaultIoError")("VaultIoError", {
  operation: Schema.String,
  path: Schema.optionalKey(Schema.String),
  message: Schema.String
}) {}

export class TaskParseError extends Schema.TaggedErrorClass<TaskParseError>("@kb/vault/TaskParseError")(
  "TaskParseError",
  {
    message: Schema.String,
    input: Schema.optionalKey(Schema.String),
    source: Schema.optionalKey(TaskSource)
  }
) {}

export class MarkdownParseError extends Schema.TaggedErrorClass<MarkdownParseError>("@kb/vault/MarkdownParseError")(
  "MarkdownParseError",
  {
    message: Schema.String,
    input: Schema.optionalKey(Schema.String)
  }
) {}

export class TaskValidationError extends Schema.TaggedErrorClass<TaskValidationError>("@kb/vault/TaskValidationError")(
  "TaskValidationError",
  {
    message: Schema.String,
    problems: Schema.Array(ValidationProblem)
  }
) {}

export class DashboardRenderError extends Schema.TaggedErrorClass<DashboardRenderError>(
  "@kb/vault/DashboardRenderError"
)("DashboardRenderError", {
  message: Schema.String,
  name: Schema.optionalKey(DashboardName)
}) {}

export type VaultError = VaultIoError | TaskParseError | TaskValidationError | DashboardRenderError | MarkdownParseError
export type TaskError = TaskParseError | TaskValidationError
