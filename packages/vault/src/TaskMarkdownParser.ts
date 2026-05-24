import { stripInlineFields } from "@kb/remark-obsidian"
import { String as Str } from "effect"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { Markdown } from "./markdown/Markdown"
import { MarkdownParser } from "./markdown/MarkdownParser"
import type { MarkdownInlineField, MarkdownTask } from "./markdown/MarkdownModel"
import { ParsedTask, TaskSource, type IsoDate } from "./TaskModel"
import type { MarkdownParseError, TaskParseError } from "./VaultErrors"

export type TaskMarkdownParserService = {
  readonly parseFile: (
    markdown: string,
    sourcePath: string
  ) => Effect.Effect<ReadonlyArray<ParsedTask>, TaskParseError | MarkdownParseError>
}

export class TaskMarkdownParser extends Context.Service<TaskMarkdownParser, TaskMarkdownParserService>()(
  "@kb/vault/TaskMarkdownParser"
) {
  static readonly layerNoDeps: Layer.Layer<TaskMarkdownParser, never, MarkdownParser> = Layer.effect(
    this,
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      return TaskMarkdownParser.of({
        parseFile: Effect.fn("TaskMarkdownParser.parseFile")(function* (markdown: string, sourcePath: string) {
          const markdownFile = yield* parser.parse(markdown)
          return parsedTasksFromMarkdown(Markdown.getTasks(markdownFile), markdown, sourcePath)
        })
      })
    })
  )
  static readonly layer: Layer.Layer<TaskMarkdownParser> = Layer.provide(this.layerNoDeps, MarkdownParser.layer)
}

const taskTag = "#task"
const taskTextTagPattern = /#[A-Za-z0-9/_-]+\b/g
const taskBodyPattern = /^\s*[-*+]\s+\[[ xX]\]\s*/
const whitespacePattern = /\s{2,}/g
const knownFields = new Set(["scheduled", "due", "completed", "depends", "repeat", "area", "project"])

export const parsedTasksFromMarkdown = (
  tasks: ReadonlyArray<MarkdownTask>,
  markdown: string,
  sourcePath: string
): ReadonlyArray<ParsedTask> => {
  const parsed: Array<ParsedTask> = []
  for (const task of tasks) {
    const tags = taskTags(task, markdown)
    if (!tags.includes(taskTag)) {
      continue
    }
    parsed.push(parsedTaskFromMarkdown(task, markdown, sourcePath, tags))
  }
  return parsed
}

const taskTags = (task: MarkdownTask, markdown: string): ReadonlyArray<string> => {
  const lineRange = taskFirstSourceLineRange(task, markdown)
  const tags: Array<string> = []
  for (const tag of task.tags) {
    if (
      lineRange !== undefined &&
      (tag.span === undefined || tag.span.start < lineRange.start || tag.span.end > lineRange.end)
    ) {
      continue
    }
    if (!tags.includes(tag.value)) {
      tags.push(tag.value)
    }
  }
  return tags
}

const parsedTaskFromMarkdown = (
  task: MarkdownTask,
  markdown: string,
  path: string,
  tags: ReadonlyArray<string>
): ParsedTask => {
  const fields = taskFields(task.fields, taskFirstSourceLineRange(task, markdown))
  const unknownFields = taskUnknownFields(fields)
  const text = taskText(task, markdown)

  return new ParsedTask({
    done: task.done,
    text,
    source: new TaskSource({ path, lineNumber: offsetLineNumber(markdown, task.span?.start ?? 0) }),
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
  inlineFields: ReadonlyArray<MarkdownInlineField>,
  lineRange: { readonly start: number; readonly end: number } | undefined
): Readonly<Record<string, string>> => {
  const fields: Record<string, string> = {}
  for (const field of inlineFields) {
    if (lineRange !== undefined && (field.span.start < lineRange.start || field.span.end > lineRange.end)) {
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

const taskText = (task: MarkdownTask, markdown: string): string => {
  const sourceLine = taskFirstSourceLine(task, markdown)
  const body = sourceLine === undefined ? task.text : sourceLine.replace(taskBodyPattern, "")
  return Str.trim(stripInlineFields(body).replace(taskTextTagPattern, "").replace(whitespacePattern, " "))
}

const taskFirstSourceLine = (task: MarkdownTask, markdown: string): string | undefined => {
  const lineRange = taskFirstSourceLineRange(task, markdown)
  if (lineRange === undefined) {
    return undefined
  }
  return markdown.slice(lineRange.start, lineRange.end)
}

const taskFirstSourceLineRange = (
  task: MarkdownTask,
  markdown: string
): { readonly start: number; readonly end: number } | undefined => {
  const start = task.span?.start
  if (start === undefined) {
    return undefined
  }

  const lineEnd = markdown.indexOf("\n", start)
  if (lineEnd === -1) {
    return { start, end: markdown.length }
  }
  return { start, end: lineEnd }
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
