import * as MarkdownAst from "@kb/markdown-ast"
import { MarkdownModel } from "@kb/vault-core"
import * as DateTime from "effect/DateTime"
import { Data, Effect, Option, Schema, String as Str } from "effect"

export class TaskParseError extends Schema.TaggedErrorClass<TaskParseError>("@kb/vault-tasks/TaskParseError")(
  "TaskParseError",
  {
    message: Schema.String,
    input: Schema.optionalKey(Schema.String),
    path: Schema.optionalKey(Schema.String),
    lineNumber: Schema.optionalKey(Schema.Number)
  }
) {}

export const IsoDate = Schema.TemplateLiteral([Schema.Number, "-", Schema.Number, "-", Schema.Number])
export type IsoDate = typeof IsoDate.Type

export class Task extends Data.Class<{
  readonly done: boolean
  readonly text: string
  readonly fields: Readonly<Record<string, string>>
  readonly unknownFields: Readonly<Record<string, string>>
  readonly tags: ReadonlyArray<string>
  readonly scheduled?: IsoDate | undefined
  readonly due?: IsoDate | undefined
  readonly completed?: IsoDate | undefined
  readonly depends?: string | undefined
  readonly repeat?: string | undefined
  readonly area?: string | undefined
  readonly project?: string | undefined
  readonly source?: MarkdownModel.SourceRef<MarkdownAst.ListItemNode> | undefined
}> {
  static from(
    node: MarkdownAst.ListItemNode
  ): Effect.Effect<Option.Option<Task>, MarkdownAst.MarkdownStringifyError, MarkdownAst.MarkdownProcessor> {
    return Effect.gen(function* () {
      const tags = taskTags(node)
      if (!tags.includes(taskTag)) {
        return Option.none()
      }

      const fields = yield* taskFields(node)
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
    })
  }
}

export const TaskViewName = Schema.Literals(["today", "week", "open"])
export type TaskViewName = typeof TaskViewName.Type

export class WeekWindow extends Schema.Class<WeekWindow>("@kb/vault-tasks/WeekWindow")({
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

const taskFields = (
  task: MarkdownAst.ListItemNode
): Effect.Effect<Readonly<Record<string, string>>, MarkdownAst.MarkdownStringifyError, MarkdownAst.MarkdownProcessor> =>
  Effect.gen(function* () {
    const line = taskSourceLine(task)
    const fields: Record<string, string> = {}
    for (const field of MarkdownAst.inlineDataFields(task)) {
      if (!sameSourceLine(line, field.position)) {
        continue
      }
      fields[MarkdownAst.inlineDataFieldKeyText(field)] = yield* MarkdownAst.inlineDataFieldValueMarkdown(field)
    }
    return fields
  })

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

  return Option.match(DateTime.make(value), {
    onNone: () => false,
    onSome: (dateTime) => DateTime.formatIsoDateUtc(dateTime) === value
  })
}

const dateField = <Key extends "scheduled" | "due" | "completed">(
  key: Key,
  value: string | undefined
): Partial<Record<Key, IsoDate>> =>
  value !== undefined && isIsoDate(value) ? ({ [key]: value } as Partial<Record<Key, IsoDate>>) : {}

