import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { DataviewProgram, DataviewRenderer } from "@kb/dataview"
import { CalendarService, type IsoDate } from "@kb/vault-core"
import { resolveDateInput } from "./DateInput"
import { dataviewSourcesFromFlags, scopeFlags } from "./OutputFormat"

const dateFlag = Flag.string("date").pipe(
  Flag.withDescription("Date as YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd; defaults to today"),
  Flag.optional
)

const startFlag = Flag.string("start").pipe(
  Flag.withDescription("Week start as YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd; defaults to today"),
  Flag.optional
)

const TaskRoot = Command.make("task").pipe(
  Command.withSharedFlags(scopeFlags),
  Command.withDescription("Compute task views from project Markdown files")
)

export const TaskCommand = TaskRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "open",
      {},
      Effect.fn(function* () {
        const flags = yield* TaskRoot
        yield* runDataviewForSources(dataviewSourcesFromFlags(flags), openQuery)
      })
    ).pipe(Command.withDescription("List all open tasks grouped by area/project")),

    Command.make(
      "today",
      { date: dateFlag },
      Effect.fn(function* ({ date }) {
        const flags = yield* TaskRoot
        const resolvedDate = yield* resolveDateInput(date, "date")
        yield* runDataviewForSources(dataviewSourcesFromFlags(flags), (source) => todayQuery(source, resolvedDate))
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
        yield* runDataviewForSources(dataviewSourcesFromFlags(flags), (source) =>
          weekQuery(source, resolvedStart, resolvedEnd)
        )
      })
    ).pipe(Command.withDescription("List tasks scheduled or due in a 7-day window")),

    Command.make(
      "due",
      { date: dateFlag },
      Effect.fn(function* ({ date }) {
        const flags = yield* TaskRoot
        const resolvedDate = yield* resolveDateInput(date, "date")
        yield* runDataviewForSources(dataviewSourcesFromFlags(flags), (source) => dueQuery(source, resolvedDate))
      })
    ).pipe(Command.withDescription("List open tasks due on or before a date")),

    Command.make(
      "repeat",
      {},
      Effect.fn(function* () {
        const flags = yield* TaskRoot
        yield* runDataviewForSources(dataviewSourcesFromFlags(flags), repeatQuery)
      })
    ).pipe(Command.withDescription("List repeating tasks and scheduled dates"))
  ])
)

const runDataviewForSources = Effect.fn(function* (
  sources: ReadonlyArray<string>,
  buildQuery: (source: string) => string
) {
  yield* Effect.forEach(sources, (source) => runDataview(buildQuery(source)))
})

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
