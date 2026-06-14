import * as MarkdownAst from "@kb/markdown-ast"
import {
  DataviewBinaryOperator,
  DataviewEvaluateError,
  DataviewQueryKind,
  DataviewRecord,
  DataviewRecordSource,
  DataviewRecordSourceError,
  type DataviewExpression,
  type DataviewQuery,
  type DataviewValue
} from "@kb/dataview"
import { allMarkdown, fromPath, Markdown, type MarkdownModel, VaultService, type Vault } from "@kb/vault-core"
import {
  RecurrenceExpansionWindow,
  type Task,
  TaskRecurrenceService,
  taskRecordsForVaultNoDeps,
  type VaultTaskRecord
} from "@kb/vault-tasks"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Trie from "effect/Trie"

export class DataviewVaultRecordSource {
  static readonly layerNoDeps: Layer.Layer<
    DataviewRecordSource,
    never,
    VaultService | TaskRecurrenceService
  > = Layer.effect(
    DataviewRecordSource,
    Effect.gen(function* () {
      const vaultService = yield* VaultService
      const recurrence = yield* TaskRecurrenceService
      const recordsFor = Effect.fn("@kb/dataview-vault/DataviewVaultRecordSource.recordsFor")(function* (
        query: DataviewQuery
      ) {
        return yield* recordsForQuery(vaultService, recurrence, query).pipe(Effect.mapError(toRecordSourceError))
      })
      return DataviewRecordSource.of({ recordsFor })
    })
  )
}

export const layerNoDeps = DataviewVaultRecordSource.layerNoDeps

const recordsForQuery = (
  vaultService: VaultService,
  recurrence: TaskRecurrenceService,
  query: DataviewQuery
): Effect.Effect<ReadonlyArray<DataviewRecord>, DataviewEvaluateError | { readonly message: string }> => {
  switch (query.kind) {
    case DataviewQueryKind.enums.Task:
      return Effect.gen(function* () {
        const vault = yield* vaultService.scoped(scopeForSource(query.source))
        const tasks = yield* expandTaskRecords(yield* taskRecordsForVaultNoDeps(vault), recurrence, query)
        const records = Chunk.map(tasks, (record) => taskRecord(record.task))
        return query.source === undefined || isDirectPathSource(query.source)
          ? Chunk.toReadonlyArray(records)
          : yield* filterRecords(records, query.source)
      })
    case DataviewQueryKind.enums.List:
    case DataviewQueryKind.enums.Table:
      return Effect.gen(function* () {
        const vault = yield* vaultService.scoped(scopeForSource(query.source))
        const records = yield* pageRecordsForVault(vault)
        return query.source === undefined || isDirectPathSource(query.source)
          ? Chunk.toReadonlyArray(records)
          : yield* filterRecords(records, query.source)
      })
  }
  return Effect.fail(new DataviewEvaluateError({ message: "Unsupported Dataview query type" }))
}

const scopeForSource = (source: DataviewExpression | undefined) =>
  source !== undefined && isDirectPathSource(source) ? fromPath(source.value) : allMarkdown

const isDirectPathSource = (
  source: DataviewExpression | undefined
): source is Extract<DataviewExpression, { readonly _tag: "StringLiteral" }> =>
  source?._tag === "StringLiteral"

const expandTaskRecords = (
  records: Chunk.Chunk<VaultTaskRecord>,
  recurrence: TaskRecurrenceService,
  query: DataviewQuery
): Effect.Effect<Chunk.Chunk<VaultTaskRecord>> => {
  const window = recurrenceWindowForQuery(query)
  if (Option.isNone(window)) {
    return Effect.succeed(records)
  }

  return Effect.gen(function* () {
    let expanded = Chunk.empty<VaultTaskRecord>()
    for (const record of Chunk.toReadonlyArray(records)) {
      expanded = Chunk.appendAll(expanded, yield* recurrence.expandRecord(record, window.value))
    }
    return expanded
  })
}

const recurrenceWindowForQuery = (query: DataviewQuery): Option.Option<RecurrenceExpansionWindow> => {
  for (const predicate of query.predicates) {
    const today = todayWindow(predicate)
    if (today !== undefined) {
      return Option.some(new RecurrenceExpansionWindow({ start: today, end: today, mode: "all-in-window" }))
    }

    const week = weekWindow(predicate)
    if (week !== undefined) {
      return Option.some(new RecurrenceExpansionWindow({ start: week.start, end: week.end, mode: "all-in-window" }))
    }

    const dueCutoff = dateComparison(predicate, "due", DataviewBinaryOperator.enums.LessThanOrEqual)
    if (dueCutoff !== undefined) {
      return Option.some(
        new RecurrenceExpansionWindow({ start: dueCutoff, end: dueCutoff, mode: "latest-on-or-before" })
      )
    }
  }

  return Option.none()
}

const todayWindow = (expression: DataviewExpression): string | undefined => {
  if (expression._tag !== "Binary" || expression.operator !== DataviewBinaryOperator.enums.Or) {
    return undefined
  }

  const left = dateComparison(expression.left, "scheduled", DataviewBinaryOperator.enums.Equal)
  const right = dateComparison(expression.right, "due", DataviewBinaryOperator.enums.Equal)
  if (left !== undefined && left === right) {
    return left
  }

  const reversedLeft = dateComparison(expression.left, "due", DataviewBinaryOperator.enums.Equal)
  const reversedRight = dateComparison(expression.right, "scheduled", DataviewBinaryOperator.enums.Equal)
  return reversedLeft !== undefined && reversedLeft === reversedRight ? reversedLeft : undefined
}

const weekWindow = (expression: DataviewExpression): { readonly start: string; readonly end: string } | undefined => {
  if (expression._tag !== "Binary" || expression.operator !== DataviewBinaryOperator.enums.Or) {
    return undefined
  }

  const scheduled = dateRange(expression.left, "scheduled")
  const due = dateRange(expression.right, "due")
  if (scheduled !== undefined && due !== undefined && scheduled.start === due.start && scheduled.end === due.end) {
    return scheduled
  }

  const reversedDue = dateRange(expression.left, "due")
  const reversedScheduled = dateRange(expression.right, "scheduled")
  return reversedDue !== undefined &&
    reversedScheduled !== undefined &&
    reversedDue.start === reversedScheduled.start &&
    reversedDue.end === reversedScheduled.end
    ? reversedDue
    : undefined
}

const dateRange = (
  expression: DataviewExpression,
  field: string
): { readonly start: string; readonly end: string } | undefined => {
  if (expression._tag !== "Binary" || expression.operator !== DataviewBinaryOperator.enums.And) {
    return undefined
  }

  const start = dateComparison(expression.left, field, DataviewBinaryOperator.enums.GreaterThanOrEqual)
  const end = dateComparison(expression.right, field, DataviewBinaryOperator.enums.LessThanOrEqual)
  return start === undefined || end === undefined ? undefined : { start, end }
}

const dateComparison = (
  expression: DataviewExpression,
  field: string,
  operator: DataviewBinaryOperator
): string | undefined => {
  if (
    expression._tag !== "Binary" ||
    expression.operator !== operator ||
    expression.left._tag !== "Identifier" ||
    expression.left.name !== field
  ) {
    return undefined
  }
  return dateCallArgument(expression.right)
}

const dateCallArgument = (expression: DataviewExpression): string | undefined => {
  if (
    expression._tag !== "Call" ||
    expression.callee._tag !== "Identifier" ||
    expression.callee.name !== "date" ||
    expression.args.length !== 1
  ) {
    return undefined
  }

  const value = expression.args[0]
  if (value?._tag === "Identifier") {
    return value.name
  }
  if (value?._tag === "StringLiteral") {
    return value.value
  }
  return value?._tag === "NumberLiteral" ? `${value.value}` : undefined
}

const filterRecords = (
  records: Chunk.Chunk<DataviewRecord>,
  source: DataviewExpression
): Effect.Effect<ReadonlyArray<DataviewRecord>, DataviewEvaluateError> =>
  Effect.gen(function* () {
    const filtered: Array<DataviewRecord> = []
    for (const record of Chunk.toReadonlyArray(records)) {
      if (yield* matchesSource(source, record.fields)) {
        filtered.push(record)
      }
    }
    return filtered
  })

const taskRecord = (task: Task): DataviewRecord =>
  new DataviewRecord({
    original: task,
    fields: taskFields(task)
  })

const pageRecordsForVault = (vault: Vault): Effect.Effect<Chunk.Chunk<DataviewRecord>, DataviewEvaluateError> =>
  Effect.gen(function* () {
    let records = Chunk.empty<DataviewRecord>()
    for (const [path, result] of Trie.entries(vault.files)) {
      if (Result.isSuccess(result)) {
        records = Chunk.append(records, yield* pageRecord(path, result.success))
      }
    }
    return records
  }).pipe(
    Effect.provide(MarkdownAst.MarkdownProcessor.layer),
    Effect.mapError((error) => new DataviewEvaluateError({ message: error.message }))
  )

const pageRecord = (
  path: string,
  file: MarkdownModel.MarkdownFile
): Effect.Effect<DataviewRecord, MarkdownAst.MarkdownStringifyError, MarkdownAst.MarkdownProcessor> =>
  Effect.gen(function* () {
    const fields: Record<string, DataviewValue> = {}
    const frontmatterLines: Array<string> = []
    const explicitTags: Array<string> = []

    for (const node of Chunk.toReadonlyArray(Markdown.frontmatter(file))) {
      if (isPlainObject(node.value)) {
        for (const [key, value] of Object.entries(node.value)) {
          const dataviewValue = dataviewValueFromUnknown(value)
          appendField(fields, key, dataviewValue)
          appendSanitizedAlias(fields, key, dataviewValue)
          if (isScalar(dataviewValue)) {
            frontmatterLines.push(`${key} | ${dataviewValue}`)
          }
          if (key === "tags") {
            appendFrontmatterTags(explicitTags, value)
          }
        }
      }
      break
    }

    const inlineDataFieldPairs: Array<readonly [string, string]> = []

    for (const field of MarkdownAst.inlineDataFields(file.mdast)) {
      const key = MarkdownAst.inlineDataFieldKeyText(field)
      const value = yield* MarkdownAst.inlineDataFieldValueMarkdown(field)
      appendField(fields, key, value)
      appendSanitizedAlias(fields, key, value)
      inlineDataFieldPairs.push([key, value])
    }

    appendBareInlineDataFields(fields, file.contents, inlineDataFieldPairs)

    for (const tag of Chunk.toReadonlyArray(Markdown.tags(file))) {
      appendUnique(explicitTags, normalizeTag(tag.value))
    }

    const etags = explicitTags
    const folder = folderForPath(path)
    fields["file.name"] = fileNameWithoutExtension(path)
    fields["file.folder"] = folder
    fields["file.path"] = path
    fields["file.ext"] = "md"
    fields["file.link"] = path
    fields["file.etags"] = etags
    fields["file.tags"] = expandedTags(etags)
    fields["file.outlinks"] = Chunk.toReadonlyArray(Markdown.wikilinks(file)).map((link) => link.target)
    fields["file.frontmatter"] = frontmatterLines

    return new DataviewRecord({ original: file, fields })
  })

const matchesSource = (
  source: DataviewExpression,
  fields: Readonly<Record<string, DataviewValue>>
): Effect.Effect<boolean, DataviewEvaluateError> => {
  switch (source._tag) {
    case "Identifier": {
      if (source.name.startsWith("#")) {
        return Effect.succeed(hasTag(fields, source.name))
      }
      return unsupportedSourceExpression
    }
    case "StringLiteral": {
      const path = fields["file.path"]
      return Effect.succeed(typeof path === "string" && matchesPathSource(path, source.value))
    }
    case "Binary": {
      if (source.operator === DataviewBinaryOperator.enums.And) {
        return Effect.gen(function* () {
          return (yield* matchesSource(source.left, fields)) && (yield* matchesSource(source.right, fields))
        })
      }
      if (source.operator === DataviewBinaryOperator.enums.Or) {
        return Effect.gen(function* () {
          return (yield* matchesSource(source.left, fields)) || (yield* matchesSource(source.right, fields))
        })
      }
      return unsupportedSourceExpression
    }
    default:
      return unsupportedSourceExpression
  }
}

const unsupportedSourceExpression = Effect.fail(
  new DataviewEvaluateError({ message: "Unsupported Dataview source expression" })
)

const taskFields = (task: Task): Readonly<Record<string, DataviewValue>> => {
  const path = task.source?.path ?? ""
  const line = task.source?.position?.start.line ?? 1

  return {
    ...task.fields,
    ...task.unknownFields,
    task: task.text,
    text: task.text,
    completed: task.done,
    scheduled: task.scheduled ?? task.fields.scheduled ?? null,
    due: task.due ?? task.fields.due ?? null,
    depends: task.depends ?? task.fields.depends ?? null,
    repeat: task.repeat ?? task.fields.repeat ?? null,
    repeatFrom: task.repeatFrom ?? task.fields.repeatFrom ?? null,
    area: task.area ?? task.fields.area ?? null,
    project: task.project ?? task.fields.project ?? null,
    tags: task.tags,
    path,
    line,
    "file.path": path,
    "file.link": path,
    "file.line": line
  }
}

const appendField = (fields: Record<string, DataviewValue>, key: string, value: DataviewValue): void => {
  const current = fields[key]
  if (current === undefined) {
    fields[key] = value
  } else if (Array.isArray(current)) {
    fields[key] = [...current, value]
  } else {
    fields[key] = [current, value]
  }
}

const appendSanitizedAlias = (fields: Record<string, DataviewValue>, key: string, value: DataviewValue): void => {
  const sanitized = key.trim().toLowerCase().replace(/\s+/g, "-")
  if (sanitized !== key) {
    appendField(fields, sanitized, value)
  }
}

const appendBareInlineDataFields = (
  fields: Record<string, DataviewValue>,
  contents: string,
  existingInlineFields: ReadonlyArray<readonly [string, string]>
): void => {
  const lines = contents.split(/\r?\n/)
  let inFrontmatter = lines.length > 0 && lines[0]?.trim() === "---"

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim() ?? ""
    if (index === 0 && inFrontmatter) {
      continue
    }
    if (inFrontmatter) {
      if (line === "---") {
        inFrontmatter = false
      }
      continue
    }

    const separator = line.indexOf("::")
    if (separator <= 0) {
      continue
    }

    const key = line.slice(0, separator).trim()
    if (key === "" || key.includes("[") || key.includes("]")) {
      continue
    }

    const value = line.slice(separator + 2).trim()
    if (hasInlineDataField(existingInlineFields, key, value)) {
      continue
    }

    appendField(fields, key, value)
    appendSanitizedAlias(fields, key, value)
  }
}

const hasInlineDataField = (
  fields: ReadonlyArray<readonly [string, string]>,
  key: string,
  value: string
): boolean => {
  for (const [fieldKey, fieldValue] of fields) {
    if (fieldKey === key && fieldValue === value) {
      return true
    }
  }
  return false
}

const appendFrontmatterTags = (tags: Array<string>, value: unknown): void => {
  if (typeof value === "string") {
    appendUnique(tags, normalizeTag(value))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        appendUnique(tags, normalizeTag(item))
      }
    }
  }
}

const dataviewValueFromUnknown = (value: unknown): DataviewValue => {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return value.map(dataviewValueFromUnknown)
  }
  if (isPlainObject(value)) {
    const object: Record<string, DataviewValue> = {}
    for (const [key, nested] of Object.entries(value)) {
      object[key] = dataviewValueFromUnknown(nested)
    }
    return object
  }
  return String(value)
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const normalizeTag = (tag: string): string => (tag.startsWith("#") ? tag : `#${tag}`)

const expandedTags = (tags: ReadonlyArray<string>): ReadonlyArray<string> => {
  const expanded: Array<string> = []
  for (const tag of tags) {
    const parts = normalizeTag(tag).slice(1).split("/")
    let current = "#"
    for (let index = 0; index < parts.length; index++) {
      current = index === 0 ? `#${parts[index]}` : `${current}/${parts[index]}`
      appendUnique(expanded, current)
    }
  }
  return expanded
}

const appendUnique = (values: Array<string>, value: string): void => {
  if (!values.includes(value)) {
    values.push(value)
  }
}

const hasTag = (fields: Readonly<Record<string, DataviewValue>>, tag: string): boolean =>
  valueContainsString(fields["file.tags"], tag) ||
  valueContainsString(fields["file.etags"], tag) ||
  valueContainsString(fields.tags, tag)

const valueContainsString = (value: DataviewValue | undefined, needle: string): boolean =>
  Array.isArray(value) ? value.some((item) => item === needle) : value === needle

const matchesPathSource = (path: string, source: string): boolean =>
  source === "." || path === source || path === `${source}.md` || path.startsWith(`${source}/`)

const folderForPath = (path: string): string => {
  const separator = path.lastIndexOf("/")
  return separator === -1 ? "" : path.slice(0, separator)
}

const fileNameWithoutExtension = (path: string): string => {
  const separator = path.lastIndexOf("/")
  const filename = separator === -1 ? path : path.slice(separator + 1)
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename
}

const isScalar = (value: DataviewValue): value is string | number | boolean | null =>
  value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"

const toRecordSourceError = (error: { readonly message: string }): DataviewRecordSourceError =>
  new DataviewRecordSourceError({ message: error.message })
