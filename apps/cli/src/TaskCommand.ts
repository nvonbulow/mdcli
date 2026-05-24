import { Chunk, Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { DataviewProgram, DataviewRenderer } from "@kb/dataview"
import { CalendarService, CatalogService, TaskValidator, type IsoDate } from "@kb/vault"
import { resolveDateInput } from "./DateInput"
import { taskSourceFlag } from "./OutputFormat"

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
    source: taskSourceFlag
  }),
  Command.withDescription("Compute task views from project Markdown files")
)

export const TaskCommand = TaskRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "open",
      {},
      Effect.fn(function* () {
        const flags = yield* TaskRoot
        yield* runDataview(openQuery(flags.source))
      })
    ).pipe(Command.withDescription("List all open tasks grouped by area/project")),

    Command.make(
      "today",
      { date: dateFlag },
      Effect.fn(function* ({ date }) {
        const flags = yield* TaskRoot
        const resolvedDate = yield* resolveDateInput(date, "date")
        yield* runDataview(todayQuery(flags.source, resolvedDate))
      })
    ).pipe(Command.withDescription("List tasks scheduled or due on a date")),

    Command.make(
      "week",
      { start: startFlag },
      Effect.fn(function* ({ start }) {
        const flags = yield* TaskRoot
        const resolvedStart = yield* resolveDateInput(start, "start")
        const calendar = yield* CalendarService
        const resolvedEnd = yield* calendar.addDays(resolvedStart, 6)
        yield* runDataview(weekQuery(flags.source, resolvedStart, resolvedEnd))
      })
    ).pipe(Command.withDescription("List tasks scheduled or due in a 7-day window")),

    Command.make(
      "due",
      { date: dateFlag },
      Effect.fn(function* ({ date }) {
        const flags = yield* TaskRoot
        const resolvedDate = yield* resolveDateInput(date, "date")
        yield* runDataview(dueQuery(flags.source, resolvedDate))
      })
    ).pipe(Command.withDescription("List open tasks due on or before a date")),

    Command.make(
      "repeat",
      {},
      Effect.fn(function* () {
        const flags = yield* TaskRoot
        yield* runDataview(repeatQuery(flags.source))
      })
    ).pipe(Command.withDescription("List repeating tasks and scheduled dates")),

    Command.make(
      "check",
      {},
      Effect.fn(function* () {
        const flags = yield* TaskRoot
        const catalog = yield* CatalogService
        const validator = yield* TaskValidator
        const taskRecords = yield* catalog.listTasks(flags.source)
        const tasks = Chunk.toReadonlyArray(Chunk.map(taskRecords, (record) => record.task))
        const problems = yield* validator.validate(tasks)
        if (problems.length === 0) {
          yield* Console.log(`Checked ${tasks.filter((task) => !task.done).length} open tasks: OK`)
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

const runDataview = Effect.fn(function* (queryText: string) {
  const program = yield* DataviewProgram
  const renderer = yield* DataviewRenderer
  const result = yield* program.run(queryText)
  const output = yield* renderer.render(result)
  yield* Console.log(output)
})

const openQuery = (source: string): string => `TASK
FROM "${source}"
WHERE !completed
GROUP BY area
SORT area ASC, project ASC, due ASC, scheduled ASC, file.link ASC, file.line ASC`

const todayQuery = (source: string, date: IsoDate): string => `TASK
FROM "${source}"
WHERE !completed
WHERE scheduled = date(${date}) OR due = date(${date})
SORT due ASC, scheduled ASC, area ASC, project ASC, file.link ASC, file.line ASC`

const weekQuery = (source: string, start: IsoDate, end: IsoDate): string => `TASK
FROM "${source}"
WHERE !completed
WHERE (scheduled >= date(${start}) AND scheduled <= date(${end})) OR (due >= date(${start}) AND due <= date(${end}))
SORT due ASC, scheduled ASC, area ASC, project ASC, file.link ASC, file.line ASC`

const dueQuery = (source: string, date: IsoDate): string => `TASK
FROM "${source}"
WHERE !completed
WHERE due <= date(${date})
SORT due ASC, scheduled ASC, area ASC, project ASC, file.link ASC, file.line ASC`

const repeatQuery = (source: string): string => `TASK
FROM "${source}"
WHERE !completed
WHERE repeat
SORT scheduled ASC, due ASC, area ASC, project ASC, file.link ASC, file.line ASC`
