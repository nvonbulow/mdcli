import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { Renderer, taskTableResult, type OutputFormat } from "@kb/dataview"
import { resolveDateInput } from "../DateInput"
import { formatFlag } from "../OutputFormat"
import {
  dueTasks,
  openTasks,
  readProjectTasks,
  ReadVaultOptions,
  repeatingTasks,
  todayTasks,
  validateTasks,
  weekTasks
} from "@kb/vault"

const dateFlag = Flag.string("date").pipe(
  Flag.withDescription("Date as YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd; defaults to today"),
  Flag.optional
)

const startFlag = Flag.string("start").pipe(
  Flag.withDescription("Week start as YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd; defaults to today"),
  Flag.optional
)

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
      { format: formatFlag },
      Effect.fn(function* ({ format }) {
        const root = yield* TaskRoot
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        yield* renderTasks(openTasks(tasks), "task open", format)
      })
    ).pipe(Command.withDescription("List all open tasks grouped by area/project")),

    Command.make(
      "today",
      { date: dateFlag, format: formatFlag },
      Effect.fn(function* ({ date, format }) {
        const root = yield* TaskRoot
        const resolvedDate = yield* resolveDateInput(date, "date")
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        yield* renderTasks(todayTasks(tasks, resolvedDate), `task today ${resolvedDate}`, format)
      })
    ).pipe(Command.withDescription("List tasks scheduled or due on a date")),

    Command.make(
      "week",
      { start: startFlag, format: formatFlag },
      Effect.fn(function* ({ start, format }) {
        const root = yield* TaskRoot
        const resolvedStart = yield* resolveDateInput(start, "start")
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        yield* renderTasks(weekTasks(tasks, resolvedStart), `task week ${resolvedStart}`, format)
      })
    ).pipe(Command.withDescription("List tasks scheduled or due in a 7-day window")),

    Command.make(
      "due",
      { date: dateFlag, format: formatFlag },
      Effect.fn(function* ({ date, format }) {
        const root = yield* TaskRoot
        const resolvedDate = yield* resolveDateInput(date, "date")
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        yield* renderTasks(dueTasks(tasks, resolvedDate), `task due ${resolvedDate}`, format)
      })
    ).pipe(Command.withDescription("List open tasks due on or before a date")),

    Command.make(
      "repeat",
      { format: formatFlag },
      Effect.fn(function* ({ format }) {
        const root = yield* TaskRoot
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        const repeating = repeatingTasks(tasks)
        yield* renderTasks(repeating, "task repeat", format)
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
const renderTasks = Effect.fn(function* (tasks: ReturnType<typeof openTasks>, query: string, format: OutputFormat) {
  const renderer = yield* Renderer
  const output = yield* renderer.render(taskTableResult(tasks, query), format)
  yield* Console.log(output)
})
