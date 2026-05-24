import { Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import {
  DataviewEvaluator,
  DataviewFunctionRegistry,
  DataviewParser,
  DataviewProgram,
  DataviewRecordSource,
  MarkdownDataviewRenderer,
  MarkdownFenceParser
} from "@kb/dataview"
import { CalendarService, VaultService } from "@kb/vault"
import { formatFlag, rendererLayerForFormat } from "../OutputFormat"

const dashboardPath = Argument.string("path").pipe(
  Argument.withDescription("Markdown dashboard file path relative to the vault root")
)

const DashboardRoot = Command.make("dashboard").pipe(
  Command.withSharedFlags({
    vault: Flag.string("vault").pipe(Flag.withDescription("Markdown vault root"))
  }),
  Command.withDescription("Render Dataview dashboard documents")
)

export const DashboardCommand = DashboardRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "render",
      { path: dashboardPath, format: formatFlag },
      Effect.fn(function* ({ path, format }) {
        const root = yield* DashboardRoot
        const output = yield* Effect.gen(function* () {
          const vault = yield* VaultService
          const renderer = yield* MarkdownDataviewRenderer
          const markdown = yield* vault.readText(path)
          return yield* renderer.renderDocument(markdown)
        }).pipe(
          Effect.provide(MarkdownDataviewRenderer.layerNoDeps),
          Effect.provide(DataviewProgram.layerNoDeps),
          Effect.provide(DataviewFunctionRegistry.layerNoDeps),
          Effect.provide(DataviewRecordSource.layerNoDeps),
          Effect.provide(DataviewEvaluator.layerNoDeps),
          Effect.provide(DataviewParser.layerNoDeps),
          Effect.provide(MarkdownFenceParser.layerNoDeps),
          Effect.provide(CalendarService.layerLive),
          Effect.provide(VaultService.makeLayer({ root: root.vault })),
          Effect.provide(rendererLayerForFormat(format))
        )
        yield* Console.log(output)
      })
    ).pipe(Command.withDescription("Render a markdown dashboard file to stdout"))
  ])
)
