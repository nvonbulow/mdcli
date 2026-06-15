import RRulePackage, { type Options as RRuleOptions } from "rrule"
import * as Chunk from "effect/Chunk"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { IsoDate, Task } from "./TaskModel"
import type { VaultTaskRecord } from "./TaskRecords"

type RRuleInstance = InstanceType<typeof RRulePackage.RRule>

export interface TaskRecurrenceService {
  readonly expandRecord: (
    record: VaultTaskRecord,
    window: RecurrenceExpansionWindow
  ) => Effect.Effect<Chunk.Chunk<VaultTaskRecord>>
  readonly parseTask: (task: Task) => Effect.Effect<TaskRecurrenceParseResult>
}

export class TaskRecurrenceService extends Context.Service<TaskRecurrenceService, TaskRecurrenceService>()(
  "@kb/vault-tasks/TaskRecurrenceService"
) {
  static readonly layerNoDeps: Layer.Layer<TaskRecurrenceService> = Layer.succeed(
    this,
    TaskRecurrenceService.of({
      expandRecord: Effect.fn("@kb/vault-tasks/TaskRecurrenceService.expandRecord")(expandRecord),
      parseTask: Effect.fn("@kb/vault-tasks/TaskRecurrenceService.parseTask")(parseTaskRecurrence)
    } as unknown as TaskRecurrenceService)
  )

  static readonly layer: Layer.Layer<TaskRecurrenceService> = TaskRecurrenceService.layerNoDeps
}

export class RecurrenceExpansionWindow extends Data.Class<{
  readonly start: IsoDate
  readonly end: IsoDate
  readonly mode: "all-in-window" | "latest-on-or-before"
}> {}

export class ParsedTaskRecurrence extends Data.Class<{
  readonly original: string
  readonly rruleText: string
  readonly repeatFrom: string | undefined
}> {}

export type TaskRecurrenceParseResult = Data.TaggedEnum<{
  readonly NoRepeat: {}
  readonly Supported: { readonly recurrence: ParsedTaskRecurrence }
  readonly Unsupported: {
    readonly original: string
    readonly reason: "empty" | "when-done" | "parse-error"
  }
}>
export const TaskRecurrenceParseResult = Data.taggedEnum<TaskRecurrenceParseResult>()

function expandRecord(
  record: VaultTaskRecord,
  window: RecurrenceExpansionWindow
): Effect.Effect<Chunk.Chunk<VaultTaskRecord>> {
  return Effect.gen(function* () {
    if (record.task.done) {
      return Chunk.of(record)
    }

    const recurrence = yield* parseTaskRecurrence(record.task)
    if (recurrence._tag !== "Supported") {
      return Chunk.of(record)
    }

    const reference = referenceDate(record.task)
    if (Option.isNone(reference)) {
      return Chunk.of(record)
    }

    const rule = ruleFromRecurrence(recurrence.recurrence, reference.value)
    if (Option.isNone(rule)) {
      return Chunk.of(record)
    }

    if (window.mode === "latest-on-or-before") {
      return latestOnOrBefore(record, rule.value, reference.value, window.end)
    }

    return allInWindow(record, rule.value, reference.value, window)
  })
}

function parseTaskRecurrence(task: Task): Effect.Effect<TaskRecurrenceParseResult> {
  const repeat = task.repeat
  if (repeat === undefined) {
    return Effect.succeed(TaskRecurrenceParseResult.NoRepeat())
  }

  const rruleText = repeat.trim()
  if (rruleText.length === 0) {
    return Effect.succeed(TaskRecurrenceParseResult.Unsupported({ original: repeat, reason: "empty" }))
  }
  if (rruleText.toLowerCase().endsWith(" when done")) {
    return Effect.succeed(TaskRecurrenceParseResult.Unsupported({ original: repeat, reason: "when-done" }))
  }

  return Effect.map(
    Effect.option(
      Effect.try({
        try: () => RRulePackage.RRule.parseText(rruleText),
        catch: () => undefined
      })
    ),
    (options) =>
      Option.match(options, {
        onNone: () => TaskRecurrenceParseResult.Unsupported({ original: repeat, reason: "parse-error" }),
        onSome: (value) =>
          value === null
            ? TaskRecurrenceParseResult.Unsupported({ original: repeat, reason: "parse-error" })
            : TaskRecurrenceParseResult.Supported({
                recurrence: new ParsedTaskRecurrence({
                  original: repeat,
                  rruleText,
                  repeatFrom: task.repeatFrom === "completion" ? "completion" : undefined
                })
              })
      })
  )
}

const ruleFromRecurrence = (
  recurrence: ParsedTaskRecurrence,
  reference: IsoDate
): Option.Option<RRuleInstance> =>
  Option.flatMap(dateFromIso(reference), (dtstart) =>
    Option.match(parseOptions(recurrence.rruleText), {
      onNone: () => Option.none(),
      onSome: (options) => Option.some(new RRulePackage.RRule({ ...options, dtstart }))
    })
  )

const parseOptions = (rruleText: string): Option.Option<Partial<RRuleOptions>> => {
  const result = Effect.runSync(
    Effect.option(
      Effect.try({
        try: () => RRulePackage.RRule.parseText(rruleText),
        catch: () => undefined
      })
    )
  )
  return Option.flatMap(result, (options) => (options === null ? Option.none() : Option.some(options)))
}

const allInWindow = (
  record: VaultTaskRecord,
  rule: RRuleInstance,
  reference: IsoDate,
  window: RecurrenceExpansionWindow
): Chunk.Chunk<VaultTaskRecord> => {
  const offset = scheduledDueOffset(record.task)
  const candidateStart = minIsoDate(window.start, addDays(window.start, -offset))
  const candidateEnd = maxIsoDate(window.end, addDays(window.end, -offset))
  const start = dateFromIso(candidateStart)
  const end = dateFromIso(candidateEnd)
  if (Option.isNone(start) || Option.isNone(end)) {
    return Chunk.of(record)
  }

  let records = Chunk.of(record)
  for (const occurrence of rule.between(start.value, end.value, true)) {
    const date = isoFromDate(occurrence)
    if (date > reference && participatesInWindow(record.task, date, window)) {
      records = Chunk.append(records, generatedRecord(record, date))
    }
  }
  return records
}

const latestOnOrBefore = (
  record: VaultTaskRecord,
  rule: RRuleInstance,
  reference: IsoDate,
  end: IsoDate
): Chunk.Chunk<VaultTaskRecord> => {
  const endDate = dateFromIso(end)
  if (Option.isNone(endDate)) {
    return Chunk.of(record)
  }

  const startDate = dateFromIso(reference)
  if (Option.isNone(startDate)) {
    return Chunk.of(record)
  }

  let latest = Option.none<IsoDate>()
  for (const occurrence of rule.between(startDate.value, endDate.value, true)) {
    const date = isoFromDate(occurrence)
    if (date > reference && participatesOnOrBefore(record.task, date, end)) {
      latest = Option.some(date)
    }
  }

  return Option.match(latest, {
    onNone: () => Chunk.of(record),
    onSome: (date) => Chunk.of(generatedRecord(record, date))
  })
}

const referenceDate = (task: Task): Option.Option<IsoDate> => {
  if (task.due !== undefined) {
    return Option.some(task.due)
  }
  if (task.scheduled !== undefined) {
    return Option.some(task.scheduled)
  }
  return Option.none()
}

const generatedRecord = (record: VaultTaskRecord, reference: IsoDate): VaultTaskRecord => {
  const task = generatedTask(record.task, reference)
  return {
    ...record,
    task,
    done: false,
    fields: task.fields,
    unknownFields: task.unknownFields
  }
}

const generatedTask = (task: Task, reference: IsoDate): Task => {
  const scheduled = generatedScheduled(task, reference)
  const due = task.due === undefined ? undefined : reference
  const fields = generatedFields(task.fields, scheduled, due)

  return new Task({
    done: false,
    text: task.text,
    source: task.source,
    fields,
    unknownFields: task.unknownFields,
    tags: task.tags,
    ...(scheduled === undefined ? {} : { scheduled }),
    ...(due === undefined ? {} : { due }),
    ...(task.depends === undefined ? {} : { depends: task.depends }),
    ...(task.repeat === undefined ? {} : { repeat: task.repeat }),
    ...(task.repeatFrom === undefined ? {} : { repeatFrom: task.repeatFrom }),
    ...(task.area === undefined ? {} : { area: task.area }),
    ...(task.project === undefined ? {} : { project: task.project })
  })
}

const generatedFields = (
  fields: Readonly<Record<string, string>>,
  scheduled: IsoDate | undefined,
  due: IsoDate | undefined
): Readonly<Record<string, string>> => {
  const { completed: _completed, scheduled: _scheduled, due: _due, ...rest } = fields
  return {
    ...rest,
    ...(scheduled === undefined ? {} : { scheduled }),
    ...(due === undefined ? {} : { due })
  }
}

const generatedScheduled = (task: Task, reference: IsoDate): IsoDate | undefined => {
  if (task.scheduled === undefined) {
    return undefined
  }
  if (task.due === undefined) {
    return reference
  }
  return addDays(reference, scheduledDueOffset(task))
}

const scheduledDueOffset = (task: Task): number =>
  task.scheduled === undefined || task.due === undefined ? 0 : daysBetween(task.due, task.scheduled)

const participatesInWindow = (task: Task, reference: IsoDate, window: RecurrenceExpansionWindow): boolean => {
  const scheduled = generatedScheduled(task, reference)
  if (task.scheduled !== undefined && task.due !== undefined) {
    return inWindow(scheduled, window.start, window.end)
  }
  const due = task.due === undefined ? undefined : reference
  return inWindow(scheduled, window.start, window.end) || inWindow(due, window.start, window.end)
}

const participatesOnOrBefore = (task: Task, reference: IsoDate, end: IsoDate): boolean => {
  const scheduled = generatedScheduled(task, reference)
  const due = task.due === undefined ? undefined : reference
  return onOrBefore(scheduled, end) || onOrBefore(due, end)
}

const inWindow = (date: IsoDate | undefined, start: IsoDate, end: IsoDate): boolean =>
  date !== undefined && date >= start && date <= end

const onOrBefore = (date: IsoDate | undefined, end: IsoDate): boolean => date !== undefined && date <= end

const minIsoDate = (left: IsoDate, right: IsoDate): IsoDate => (left <= right ? left : right)
const maxIsoDate = (left: IsoDate, right: IsoDate): IsoDate => (left >= right ? left : right)

const isoFromDate = (date: Date): IsoDate => DateTime.formatIsoDateUtc(DateTime.fromDateUnsafe(date)) as IsoDate

const dateFromIso = (date: IsoDate): Option.Option<Date> =>
  Option.map(DateTime.make(date), (dateTime) => DateTime.toDateUtc(dateTime))

const addDays = (date: IsoDate, days: number): IsoDate =>
  Option.match(DateTime.make(date), {
    onNone: () => date,
    onSome: (dateTime) => DateTime.formatIsoDateUtc(DateTime.add(dateTime, { days })) as IsoDate
  })

const daysBetween = (start: IsoDate, end: IsoDate): number => {
  const startDate = DateTime.make(start)
  const endDate = DateTime.make(end)
  if (Option.isNone(startDate) || Option.isNone(endDate)) {
    return 0
  }
  return Duration.toMillis(DateTime.distance(startDate.value, endDate.value)) / 86_400_000
}
