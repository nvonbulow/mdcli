import { Clock, Console, Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import {
  dueTasks,
  isoDateFromEpochMillis,
  isIsoDate,
  openTasks,
  readProjectTasks,
  ReadVaultOptions,
  renderGroupedOpenTasks,
  renderRepeatTaskLine,
  renderTaskList,
  repeatingTasks,
  todayTasks,
  validateTasks,
  weekTasks,
  type IsoDate
} from "@kb/vault"

const dateFlag = Flag.string("date").pipe(Flag.withDescription("Date in YYYY-MM-DD format"), Flag.optional)

const startFlag = Flag.string("start").pipe(Flag.withDescription("Week start date in YYYY-MM-DD format"), Flag.optional)

const TaskRoot = Command.make("task").pipe(
  Command.withSharedFlags({
    vault: Flag.string("vault").pipe(Flag.withDescription("Markdown vault root"), Flag.withDefault("vault"))
  }),
  Command.withDescription("Compute task views from project Markdown files")
)

export const TaskCommand = TaskRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "open",
      {},
      Effect.fn(function* () {
        const root = yield* TaskRoot
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        yield* Console.log(renderGroupedOpenTasks(tasks))
      })
    ).pipe(Command.withDescription("List all open tasks grouped by area/project")),

    Command.make(
      "today",
      { date: dateFlag },
      Effect.fn(function* ({ date }) {
        const root = yield* TaskRoot
        const resolvedDate = yield* resolveDate(date, "date")
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        yield* Console.log(renderTaskList(todayTasks(tasks, resolvedDate)))
      })
    ).pipe(Command.withDescription("List tasks scheduled or due on a date")),

    Command.make(
      "week",
      { start: startFlag },
      Effect.fn(function* ({ start }) {
        const root = yield* TaskRoot
        const resolvedStart = yield* resolveDate(start, "start")
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        yield* Console.log(renderTaskList(weekTasks(tasks, resolvedStart)))
      })
    ).pipe(Command.withDescription("List tasks scheduled or due in a 7-day window")),

    Command.make(
      "due",
      { date: dateFlag },
      Effect.fn(function* ({ date }) {
        const root = yield* TaskRoot
        const resolvedDate = yield* resolveDate(date, "date")
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        yield* Console.log(renderTaskList(dueTasks(tasks, resolvedDate)))
      })
    ).pipe(Command.withDescription("List open tasks due on or before a date")),

    Command.make(
      "repeat",
      {},
      Effect.fn(function* () {
        const root = yield* TaskRoot
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        const repeating = repeatingTasks(tasks)
        if (repeating.length === 0) {
          yield* Console.log("No repeating tasks found.")
          return
        }
        yield* Console.log(repeating.map(renderRepeatTaskLine).join("\n"))
      })
    ).pipe(Command.withDescription("List repeating tasks and scheduled dates")),

    Command.make(
      "check",
      {},
      Effect.fn(function* () {
        const root = yield* TaskRoot
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        const problems = validateTasks(tasks)
        if (problems.length === 0) {
          yield* Console.log(`Checked ${openTasks(tasks).length} open tasks: OK`)
          return
        }
        for (const problem of problems) {
          yield* Console.error(`${problem.source.path}:${problem.source.lineNumber}: ${problem.message}`)
        }
        return yield* Effect.fail(new Error(`Task check failed with ${problems.length} problem(s)`))
      })
    ).pipe(Command.withDescription("Validate task metadata invariants"))
  ])
)

const resolveDate = Effect.fn(function* (date: Option.Option<string>, flagName: string) {
  if (Option.isSome(date)) {
    if (!isIsoDate(date.value)) {
      return yield* Effect.fail(new Error(`--${flagName} must use YYYY-MM-DD`))
    }
    return date.value
  }

  const millis = yield* Clock.currentTimeMillis
  return isoDateFromEpochMillis(millis)
})
