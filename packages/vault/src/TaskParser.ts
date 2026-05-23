import { Option, String as Str } from "effect"
import { IsoDate, ParsedTask, TaskSource } from "./TaskModel"

const taskLinePattern = /^\s*-\s+\[([ xX])\]\s+(.*)$/
const fieldStartPattern = /^([A-Za-z][A-Za-z0-9_-]*)::\s*/
const knownFields = new Set(["scheduled", "due", "completed", "depends", "repeat", "area", "project"])

export const isIsoDate = (value: string): value is IsoDate => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export const parseTasksFromMarkdown = (markdown: string, path: string): ReadonlyArray<ParsedTask> => {
  const tasks: Array<ParsedTask> = []
  const lines = Str.split(markdown, /\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const task = parseTaskLine(lines[index] ?? "", path, index + 1)
    if (Option.isSome(task)) {
      tasks.push(task.value)
    }
  }

  return tasks
}

export const parseTaskLine = (line: string, path: string, lineNumber: number): Option.Option<ParsedTask> => {
  if (!Str.includes("#task")(line)) {
    return Option.none()
  }

  const match = taskLinePattern.exec(line)
  if (match === null) {
    return Option.none()
  }

  const marker = match[1] ?? " "
  const body = match[2] ?? ""
  const taskTag = body.indexOf("#task")
  if (taskTag === -1) {
    return Option.none()
  }

  const fields = extractInlineFields(body)
  const unknownFields: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!knownFields.has(key)) {
      unknownFields[key] = value
    }
  }

  return Option.some(
    new ParsedTask({
      done: marker === "x" || marker === "X",
      text: Str.trim(body.slice(0, taskTag)),
      source: new TaskSource({ path, lineNumber }),
      fields,
      unknownFields,
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

export const extractInlineFields = (input: string): Readonly<Record<string, string>> => {
  const fields: Record<string, string> = {}
  let cursor = 0

  while (cursor < input.length) {
    const open = input.indexOf("[", cursor)
    if (open === -1) {
      break
    }

    const fieldMatch = fieldStartPattern.exec(input.slice(open + 1))
    if (fieldMatch === null) {
      cursor = open + 1
      continue
    }

    const key = fieldMatch[1] ?? ""
    const valueStart = open + 1 + fieldMatch[0].length
    const close = findInlineFieldClose(input, valueStart)
    if (close === -1) {
      cursor = valueStart
      continue
    }

    fields[key] = Str.trim(input.slice(valueStart, close))
    cursor = close + 1
  }

  return fields
}

const findInlineFieldClose = (input: string, valueStart: number): number => {
  let index = valueStart
  while (index < input.length) {
    if (input.startsWith("[[", index)) {
      const wikilinkClose = input.indexOf("]]", index + 2)
      if (wikilinkClose === -1) {
        return -1
      }
      index = wikilinkClose + 2
      continue
    }

    if (input[index] === "]") {
      return index
    }

    index += 1
  }

  return -1
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
