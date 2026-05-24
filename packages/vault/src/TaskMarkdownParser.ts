import { String as Str } from "effect"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { InlineFieldParser } from "./InlineFieldParser"
import { ParsedTask, TaskSource, type IsoDate } from "./TaskModel"
import type { TaskParseError } from "./VaultErrors"

export type TaskMarkdownParserService = {
  readonly parseFile: (markdown: string, sourcePath: string) => Effect.Effect<ReadonlyArray<ParsedTask>, TaskParseError>
}

export class TaskMarkdownParser extends Context.Service<TaskMarkdownParser, TaskMarkdownParserService>()(
  "@kb/vault/TaskMarkdownParser"
) {
  static readonly layerNoDeps: Layer.Layer<TaskMarkdownParser, never, InlineFieldParser> = Layer.effect(
    this,
    Effect.gen(function* () {
      const inlineFields = yield* InlineFieldParser
      return TaskMarkdownParser.of({
        parseFile: Effect.fn("TaskMarkdownParser.parseFile")(function* (markdown: string, sourcePath: string) {
          const tasks: Array<ParsedTask> = []
          const lines = Str.split(markdown, /\r?\n/)

          for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index] ?? ""
            const candidate = taskLineCandidate(line)
            if (candidate === undefined) {
              continue
            }

            const taskTag = candidate.body.indexOf("#task")
            if (taskTag === -1) {
              continue
            }

            const fields = yield* inlineFields.parse(candidate.body)
            const text = yield* inlineFields.strip(candidate.body.slice(0, taskTag))
            const task = parseTaskLineWithFields(candidate.marker, candidate.body, sourcePath, index + 1, fields, text)
            if (task !== undefined) {
              tasks.push(task)
            }
          }

          return tasks
        })
      })
    })
  )
  static readonly layer: Layer.Layer<TaskMarkdownParser> = Layer.provide(
    this.layerNoDeps,
    InlineFieldParser.layerNoDeps
  )
}

const taskLinePattern = /^\s*-\s+\[([ xX])\]\s+(.*)$/
const tagPattern = /#[A-Za-z0-9/_-]+/g
const knownFields = new Set(["scheduled", "due", "completed", "depends", "repeat", "area", "project"])

const extractTags = (input: string): ReadonlyArray<string> => {
  const tags: Array<string> = []
  for (const match of input.matchAll(tagPattern)) {
    const tag = match[0]
    if (!tags.includes(tag)) {
      tags.push(tag)
    }
  }
  return tags
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

const taskLineCandidate = (line: string): { readonly marker: string; readonly body: string } | undefined => {
  if (!Str.includes("#task")(line)) {
    return undefined
  }

  const match = taskLinePattern.exec(line)
  if (match === null) {
    return undefined
  }

  const body = match[2] ?? ""
  if (body.indexOf("#task") === -1) {
    return undefined
  }

  return { marker: match[1] ?? " ", body }
}

const parseTaskLineWithFields = (
  marker: string,
  body: string,
  path: string,
  lineNumber: number,
  fields: Readonly<Record<string, string>>,
  text: string
): ParsedTask | undefined => {
  const taskTag = body.indexOf("#task")
  if (taskTag === -1) {
    return undefined
  }

  const unknownFields: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!knownFields.has(key)) {
      unknownFields[key] = value
    }
  }

  return new ParsedTask({
    done: marker === "x" || marker === "X",
    text,
    source: new TaskSource({ path, lineNumber }),
    fields,
    unknownFields,
    tags: extractTags(body),
    ...dateField("scheduled", fields.scheduled),
    ...dateField("due", fields.due),
    ...dateField("completed", fields.completed),
    ...(fields.depends === undefined ? {} : { depends: fields.depends }),
    ...(fields.repeat === undefined ? {} : { repeat: fields.repeat }),
    ...(fields.area === undefined ? {} : { area: fields.area }),
    ...(fields.project === undefined ? {} : { project: fields.project })
  })
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
