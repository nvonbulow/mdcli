import { Console, Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { Renderer, taskTableResult, type OutputFormat } from "@kb/dataview"
import { resolveDateInput } from "../DateInput"
import { formatFlag } from "../OutputFormat"
import {
  DashboardRenderOptions,
  readProjectTasks,
  ReadVaultOptions,
  openTasks,
  sortTasksByGroup,
  todayTasks,
  weekTasks,
  type DashboardName,
  type ParsedTask
} from "@kb/vault"

const dateFlag = Flag.string("date").pipe(
  Flag.withDescription(
    "Today dashboard date as YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd; defaults to today"
  ),
  Flag.optional
)

const startFlag = Flag.string("start").pipe(
  Flag.withDescription(
    "Week dashboard start as YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd; defaults to today"
  ),
  Flag.optional
)

const dashboardName = Argument.choice("dashboard_name", ["today", "week", "open"] as const).pipe(
  Argument.withDescription("Dashboard to render: today, week, or open")
)

const DashboardRoot = Command.make("dashboard").pipe(
  Command.withSharedFlags({
    vault: Flag.string("vault").pipe(Flag.withDescription("Markdown vault root"), Flag.withDefault("vault"))
  }),
  Command.withDescription("Render computed dashboards")
)

export const DashboardCommand = DashboardRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "render",
      { name: dashboardName, date: dateFlag, start: startFlag, format: formatFlag },
      Effect.fn(function* ({ name, date, start, format }) {
        const root = yield* DashboardRoot
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        const options = yield* resolveDashboardOptions(name, date, start)
        yield* renderDashboardResult(tasks, options, format)
      })
    ).pipe(Command.withDescription("Render a dashboard to stdout"))
  ])
)

const resolveDashboardOptions = Effect.fn(function* (
  name: DashboardName,
  date: Option.Option<string>,
  start: Option.Option<string>
) {
  switch (name) {
    case "today": {
      const resolvedDate = yield* resolveDateInput(date, "date")
      return new DashboardRenderOptions({ name, date: resolvedDate })
    }
    case "week": {
      const resolvedStart = yield* resolveDateInput(start, "start")
      return new DashboardRenderOptions({ name, start: resolvedStart })
    }
    case "open":
      return new DashboardRenderOptions({ name })
  }
})
const renderDashboardResult = Effect.fn(function* (
  tasks: ReadonlyArray<ParsedTask>,
  options: DashboardRenderOptions,
  format: OutputFormat
) {
  const renderer = yield* Renderer
  const resolved = dashboardTasks(tasks, options)
  const table = yield* renderer.render(
    taskTableResult(resolved.tasks, `dashboard ${options.name}`, options.name),
    format
  )
  const output = format === "pretty" ? `# ${resolved.title}\n\n${resolved.summary}\n\n${table}` : table
  yield* Console.log(output)
})

const dashboardTasks = (tasks: ReadonlyArray<ParsedTask>, options: DashboardRenderOptions) => {
  switch (options.name) {
    case "today": {
      const date = options.date ?? ""
      const selected = options.date === undefined ? [] : todayTasks(tasks, options.date)
      return {
        title: `Today — ${date}`,
        summary: `${selected.length} open task${plural(selected.length)} scheduled or due today.`,
        tasks: selected
      }
    }
    case "week": {
      const start = options.start ?? ""
      const selected = options.start === undefined ? [] : weekTasks(tasks, options.start)
      return {
        title: `This Week — ${start}`,
        summary: `${selected.length} open task${plural(selected.length)} scheduled or due in this window.`,
        tasks: selected
      }
    }
    case "open": {
      const selected = sortTasksByGroup(openTasks(tasks))
      return {
        title: "All Open Tasks",
        summary: `${selected.length} open task${plural(selected.length)}.`,
        tasks: selected
      }
    }
  }
}

const plural = (count: number): string => (count === 1 ? "" : "s")
