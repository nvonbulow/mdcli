import { Schema } from "effect"

export const IsoDate = Schema.TemplateLiteral([Schema.Number, "-", Schema.Number, "-", Schema.Number])
export type IsoDate = typeof IsoDate.Type

export const SourcePoint = Schema.Struct({
  line: Schema.Number,
  column: Schema.Number,
  offset: Schema.optional(Schema.Number)
})

export const SourcePosition = Schema.Struct({
  start: SourcePoint,
  end: SourcePoint
})

export class TaskSource extends Schema.Class<TaskSource>("@kb/vault/TaskSource")({
  path: Schema.String,
  lineNumber: Schema.Number,
  position: Schema.optionalKey(SourcePosition)
}) {}

export class ParsedTask extends Schema.Class<ParsedTask>("@kb/vault/ParsedTask")({
  done: Schema.Boolean,
  text: Schema.String,
  source: TaskSource,
  fields: Schema.Record(Schema.String, Schema.String),
  unknownFields: Schema.Record(Schema.String, Schema.String),
  tags: Schema.Array(Schema.String),
  scheduled: Schema.optionalKey(IsoDate),
  due: Schema.optionalKey(IsoDate),
  completed: Schema.optionalKey(IsoDate),
  depends: Schema.optionalKey(Schema.String),
  repeat: Schema.optionalKey(Schema.String),
  area: Schema.optionalKey(Schema.String),
  project: Schema.optionalKey(Schema.String)
}) {}

export const TaskViewName = Schema.Literals(["today", "week", "open"])
export type TaskViewName = typeof TaskViewName.Type

export class WeekWindow extends Schema.Class<WeekWindow>("@kb/vault/WeekWindow")({
  start: IsoDate,
  end: IsoDate
}) {}
