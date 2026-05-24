import {
  stripInlineFields,
  type ObsidianInlineField,
  type ObsidianListItem,
  type ObsidianTag
} from "@kb/remark-obsidian"
import { String as Str } from "effect"
import * as Chunk from "effect/Chunk"
import { Markdown } from "./markdown/Markdown"
import type { MarkdownFile, SourcePosition } from "./markdown/MarkdownModel"
import { ParsedTask, TaskSource, type IsoDate } from "./TaskModel"

export const parsedTasksFromMarkdownFile = (file: MarkdownFile): Chunk.Chunk<ParsedTask> =>
  parsedTasksFromMarkdownTasks(Markdown.getTasks(file), file.contents, markdownFilePath(file))

const taskTag = "#task"
const taskTextTagPattern = /#[A-Za-z0-9/_-]+\b/g
const whitespacePattern = /\s{2,}/g
const knownFields = new Set(["scheduled", "due", "completed", "depends", "repeat", "area", "project"])

const parsedTasksFromMarkdownTasks = (
  tasks: Iterable<ObsidianListItem>,
  markdown: string,
  sourcePath: string
): Chunk.Chunk<ParsedTask> => {
  let parsed = Chunk.empty<ParsedTask>()
  for (const task of tasks) {
    const tags = taskTags(task, markdown)
    if (!tags.includes(taskTag)) {
      continue
    }
    parsed = Chunk.append(parsed, parsedTaskFromMarkdown(task, markdown, sourcePath, tags))
  }
  return parsed
}

const markdownFilePath = (file: MarkdownFile): string => {
  if ("path" in file && typeof file.path === "string") {
    return file.path
  }
  return ""
}

const taskTags = (task: ObsidianListItem, markdown: string): ReadonlyArray<string> => {
  const lineRange = taskFirstSourceLineRange(task, markdown)
  const tags: Array<string> = []
  for (const tag of task.data?.obsidianTask?.tags ?? []) {
    const span = positionSpan(tag.position)
    if (lineRange !== undefined && (span === undefined || span.start < lineRange.start || span.end > lineRange.end)) {
      continue
    }
    if (!tags.includes(tag.value)) {
      tags.push(tag.value)
    }
  }
  return tags
}

const parsedTaskFromMarkdown = (
  task: ObsidianListItem,
  markdown: string,
  path: string,
  tags: ReadonlyArray<string>
): ParsedTask => {
  const fields = taskFields(task.data?.obsidianTask?.inlineFields ?? [], taskFirstSourceLineRange(task, markdown))
  const unknownFields = taskUnknownFields(fields)
  const text = taskText(task, markdown)

  return new ParsedTask({
    done: task.data?.obsidianTask?.done ?? task.checked === true,
    text,
    source: new TaskSource({
      path,
      lineNumber: task.position?.start.line ?? offsetLineNumber(markdown, task.position?.start.offset ?? 0),
      ...optionalPosition(task.position)
    }),
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
}

const taskFields = (
  inlineFields: Iterable<ObsidianInlineField>,
  lineRange: { readonly start: number; readonly end: number } | undefined
): Readonly<Record<string, string>> => {
  const fields: Record<string, string> = {}
  for (const field of inlineFields) {
    const span = positionSpan(field.position)
    if (lineRange !== undefined && (span === undefined || span.start < lineRange.start || span.end > lineRange.end)) {
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

const taskText = (task: ObsidianListItem, markdown: string): string => {
  const sourceLine = taskFirstSourceLine(task, markdown)
  const body =
    sourceLine === undefined ? (task.data?.obsidianTask?.text ?? Markdown.listItemText(task)) : taskLineBody(sourceLine)
  return Str.trim(stripInlineFields(body).replace(taskTextTagPattern, "").replace(whitespacePattern, " "))
}

const taskLineBody = (sourceLine: string): string => {
  const marker = sourceLine.indexOf("]")
  return marker === -1 ? sourceLine : sourceLine.slice(marker + 1)
}

const taskFirstSourceLine = (task: ObsidianListItem, markdown: string): string | undefined => {
  const lineRange = taskFirstSourceLineRange(task, markdown)
  if (lineRange === undefined) {
    return undefined
  }
  return markdown.slice(lineRange.start, lineRange.end)
}

const taskFirstSourceLineRange = (
  task: ObsidianListItem,
  markdown: string
): { readonly start: number; readonly end: number } | undefined => {
  const start = task.position?.start.offset
  if (start === undefined) {
    return undefined
  }

  const lineEnd = markdown.indexOf("\n", start)
  if (lineEnd === -1) {
    return { start, end: markdown.length }
  }
  return { start, end: lineEnd }
}

const positionSpan = (
  position: SourcePosition | ObsidianTag["position"] | undefined
): { readonly start: number; readonly end: number } | undefined => {
  const start = position?.start.offset
  const end = position?.end.offset
  return typeof start === "number" && typeof end === "number" ? { start, end } : undefined
}

const offsetLineNumber = (markdown: string, offset: number): number => {
  let lineNumber = 1
  const end = Math.min(offset, markdown.length)
  for (let index = 0; index < end; index += 1) {
    if (markdown.charCodeAt(index) === 10) {
      lineNumber += 1
    }
  }
  return lineNumber
}

const optionalPosition = <P>(position: P | undefined): { readonly position?: P } => {
  if (position === undefined) {
    return {}
  }
  return { position }
}

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
