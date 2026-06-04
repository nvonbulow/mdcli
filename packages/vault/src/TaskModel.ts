import * as MarkdownAst from "@kb/markdown-ast"
import { Option, Schema, String as Str } from "effect"

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

export class Task extends Schema.Class<Task>("@kb/vault/Task")({
  done: Schema.Boolean,
  text: Schema.String,
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
}) {
  static from(node: MarkdownAst.ListItemNode): Option.Option<Task> {
    const tags = taskTags(node)
    if (!tags.includes(taskTag)) {
      return Option.none()
    }

    const fields = taskFields(node)
    const unknownFields = taskUnknownFields(fields)

    return Option.some(
      new Task({
        done: checked(node),
        text: taskText(node),
        fields,
        unknownFields,
        tags,
        ...dateField("scheduled", fields.scheduled),
        ...dateField("due", fields.due),
        ...dateField("completed", fields.completed),
        ...(fields.depends === undefined ? {} : { depends: fields.depends }),
        ...(fields.repeat === undefined ? {} : { repeat: fields.repeat }),
        ...(fields.area === undefined ? {} : { area: fields.area }),
        ...(fields.project === undefined ? {} : { project: fields.project })
      })
    )
  }
}

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

const taskTag = "#task"
const taskTextTagPattern = /#[A-Za-z0-9/_-]+\b/g
const taskTextCheckboxPattern = /^\s*[-*+]\s+\[[ xX]\]\s*/
const knownFields: Record<string, true> = {
  scheduled: true,
  due: true,
  completed: true,
  depends: true,
  repeat: true,
  area: true,
  project: true
}
const whitespacePattern = /\s{2,}/g

type PositionLike = {
  readonly start: {
    readonly line?: number | undefined
  }
}

const taskTags = (task: MarkdownAst.ListItemNode): ReadonlyArray<string> => {
  const line = taskSourceLine(task)
  const tags: Array<string> = []
  for (const tag of MarkdownAst.tags(task)) {
    if (!sameSourceLine(line, tag.position)) {
      continue
    }
    if (!tags.includes(tag.value)) {
      tags.push(tag.value)
    }
  }
  return tags
}

const taskFields = (task: MarkdownAst.ListItemNode): Readonly<Record<string, string>> => {
  const line = taskSourceLine(task)
  const fields: Record<string, string> = {}
  for (const field of MarkdownAst.inlineDataFields(task)) {
    if (!sameSourceLine(line, field.position)) {
      continue
    }
    fields[MarkdownAst.inlineDataFieldKeyText(field)] = MarkdownAst.inlineDataFieldValueMarkdown(field)
  }
  return fields
}

const taskUnknownFields = (fields: Readonly<Record<string, string>>): Readonly<Record<string, string>> => {
  const unknownFields: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (knownFields[key] !== true) {
      unknownFields[key] = value
    }
  }
  return unknownFields
}

const taskText = (task: MarkdownAst.ListItemNode): string => {
  const text = firstLine(listItemFirstParagraphText(task) ?? listItemTextWithoutNestedLists(task) ?? "").replace(
    taskTextCheckboxPattern,
    ""
  )
  return Str.trim(text.replace(taskTextTagPattern, "").replace(whitespacePattern, " "))
}

const listItemFirstParagraphText = (node: MarkdownAst.ListItemNode): string | undefined => {
  for (const child of node.children) {
    if (child._tag === "ParagraphNode") {
      return nodeTextWithoutInlineFields(child)
    }
  }
  return undefined
}

const listItemTextWithoutNestedLists = (node: MarkdownAst.ListItemNode): string | undefined => nodeTextWithoutNestedLists(node)

const firstLine = (text: string): string => {
  const newline = text.indexOf("\n")
  return newline === -1 ? text : text.slice(0, newline)
}

const nodeTextWithoutInlineFields = (node: MarkdownAst.AnyNode): string => {
  if (node._tag === "InlineDataFieldNode" || node._tag === "BlockAnchorNode") {
    return ""
  }
  if (!("children" in node)) {
    return MarkdownAst.nodeText(node)
  }
  let text = ""
  for (const child of node.children as ReadonlyArray<MarkdownAst.AnyNode>) {
    text = text + nodeTextWithoutInlineFields(child)
  }
  return text
}

const nodeTextWithoutNestedLists = (node: MarkdownAst.AnyNode): string => {
  if (node._tag === "InlineDataFieldNode" || node._tag === "BlockAnchorNode" || node._tag === "ListNode") {
    return ""
  }
  if (!("children" in node)) {
    return MarkdownAst.nodeText(node)
  }
  let text = ""
  for (const child of node.children as ReadonlyArray<MarkdownAst.AnyNode>) {
    text = text + nodeTextWithoutNestedLists(child)
  }
  return text
}

const taskSourceLine = (task: MarkdownAst.ListItemNode): number | undefined => task.position?.start.line

const sameSourceLine = (line: number | undefined, position: PositionLike | undefined): boolean =>
  line === undefined || position?.start.line === line

const checked = (task: MarkdownAst.ListItemNode): boolean => (Option.isSome(task.checked) ? task.checked.value : false)

const isIsoDate = (value: string): value is IsoDate => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

const dateField = <Key extends "scheduled" | "due" | "completed">(
  key: Key,
  value: string | undefined
): Partial<Record<Key, IsoDate>> =>
  value !== undefined && isIsoDate(value) ? ({ [key]: value } as Partial<Record<Key, IsoDate>>) : {}

const daysInMonth = (year: number, month: number): number => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

const isLeapYear = (year: number): boolean => year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
