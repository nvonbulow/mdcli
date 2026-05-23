import { Clock, Console, Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import {
  DashboardRenderOptions,
  isoDateFromEpochMillis,
  isIsoDate,
  readProjectTasks,
  ReadVaultOptions,
  renderDashboard,
  type DashboardName,
  type IsoDate
} from "@kb/vault"

const dateFlag = Flag.string("date").pipe(
  Flag.withDescription("Today dashboard date in YYYY-MM-DD format"),
  Flag.optional
)

const startFlag = Flag.string("start").pipe(
  Flag.withDescription("Week dashboard start date in YYYY-MM-DD format"),
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
      { name: dashboardName, date: dateFlag, start: startFlag },
      Effect.fn(function* ({ name, date, start }) {
        const root = yield* DashboardRoot
        const tasks = yield* readProjectTasks(new ReadVaultOptions({ root: root.vault }))
        const options = yield* resolveDashboardOptions(name, date, start)
        yield* Console.log(renderDashboard(tasks, options))
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
      const resolvedDate = yield* resolveDate(date, "date")
      return new DashboardRenderOptions({ name, date: resolvedDate })
    }
    case "week": {
      const resolvedStart = yield* resolveDate(start, "start")
      return new DashboardRenderOptions({ name, start: resolvedStart })
    }
    case "open":
      return new DashboardRenderOptions({ name })
  }
})

const resolveDate = Effect.fn(function* (date: Option.Option<string>, flagName: string) {
  if (Option.isSome(date)) {
    if (!isIsoDate(date.value)) {
      return yield* Effect.fail(new Error(`--${flagName} must use YYYY-MM-DD`))
    }
    return date.value as IsoDate
  }

  const millis = yield* Clock.currentTimeMillis
  return isoDateFromEpochMillis(millis)
})
