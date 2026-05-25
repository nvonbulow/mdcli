import {
  stripInlineFields,
  type ObsidianInlineField,
  type ObsidianListItem
} from "@kb/remark-obsidian"
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
  static from(node: ObsidianListItem): Option.Option<Task> {
    const tags = taskTags(node)
    if (!tags.includes(taskTag)) {
      return Option.none()
    }

    const fields = taskFields(node.data?.obsidianTask?.inlineFields ?? [], taskSourceLine(node))
    const unknownFields = taskUnknownFields(fields)

    return Option.some(
      new Task({
        done: node.data?.obsidianTask?.done ?? node.checked === true,
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
const whitespacePattern = /\s{2,}/g
const knownFields = new Set(["scheduled", "due", "completed", "depends", "repeat", "area", "project"])

type PositionLike = {
  readonly start: {
    readonly line?: number | undefined
    readonly offset?: number | undefined
  }
  readonly end: {
    readonly line?: number | undefined
    readonly offset?: number | undefined
  }
}
type MarkdownNode = {
  readonly type: string
  readonly children?: ReadonlyArray<MarkdownNode>
  readonly value?: unknown
}


const taskTags = (task: ObsidianListItem): ReadonlyArray<string> => {
  const line = taskSourceLine(task)
  const tags: Array<string> = []
  for (const tag of task.data?.obsidianTask?.tags ?? []) {
    if (!sameSourceLine(line, tag.position)) {
      continue
    }
    if (!tags.includes(tag.value)) {
      tags.push(tag.value)
    }
  }
  return tags
}

const taskFields = (
  inlineFields: Iterable<ObsidianInlineField>,
  line: number | undefined
): Readonly<Record<string, string>> => {
  const fields: Record<string, string> = {}
  for (const field of inlineFields) {
    if (!sameSourceLine(line, field.position)) {
      continue
    }
    fields[field.key] = field.value
  }
  return fields
}

const taskUnknownFields = (fields: Readonly<Record<string, string>>): Readonly<Record<string, string>> => {
  const unknownFields: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!knownFields.has(key)) {
      unknownFields[key] = value
    }
  }
  return unknownFields
}

const taskText = (task: ObsidianListItem): string => {
  const syntaxText = listItemFirstParagraphText(task)
  const fallbackText = task.data?.obsidianTask?.rawText ?? listItemTextWithoutNestedLists(task) ?? task.data?.obsidianTask?.text ?? ""
  const text = firstLine(syntaxText ?? fallbackText).replace(taskTextCheckboxPattern, "")
  return Str.trim(stripInlineFields(text).replace(taskTextTagPattern, "").replace(whitespacePattern, " "))
}

const listItemFirstParagraphText = (node: unknown): string | undefined => {
  const children = (node as MarkdownNode).children
  if (children === undefined) {
    return undefined
  }
  for (const child of children) {
    if (child.type === "paragraph") {
      return nodeTextWithoutInlineFields(child)
    }
  }
  return undefined
}

const listItemTextWithoutNestedLists = (node: unknown): string | undefined => {
  const children = (node as MarkdownNode).children
  return children === undefined ? undefined : nodeTextWithoutNestedLists(node)
}

const firstLine = (text: string): string => {
  const newline = text.indexOf("\n")
  return newline === -1 ? text : text.slice(0, newline)
}

const nodeTextWithoutInlineFields = (node: unknown): string => {
  const markdownNode = node as MarkdownNode
  if (markdownNode.type === "obsidianInlineField") {
    return ""
  }
  const literal = markdownNode.value
  if (typeof literal === "string") {
    return literal
  }
  const children = markdownNode.children
  if (children === undefined) {
    return ""
  }
  let text = ""
  for (const child of children) {
    text = text + nodeTextWithoutInlineFields(child)
  }
  return text
}

const nodeTextWithoutNestedLists = (node: unknown): string => {
  const markdownNode = node as MarkdownNode
  if (markdownNode.type === "obsidianInlineField") {
    return ""
  }
  const literal = markdownNode.value
  if (typeof literal === "string") {
    return literal
  }
  const children = markdownNode.children
  if (children === undefined) {
    return ""
  }
  let text = ""
  for (const child of children) {
    if (child.type !== "list") {
      text = text + nodeTextWithoutNestedLists(child)
    }
  }
  return text
}

const taskSourceLine = (task: ObsidianListItem): number | undefined =>
  task.position?.start.line ?? task.data?.obsidianTask?.position?.start.line

const sameSourceLine = (line: number | undefined, position: PositionLike | undefined): boolean =>
  line === undefined || position?.start.line === line

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
