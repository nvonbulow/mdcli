import { MarkdownDataviewRenderer } from "@kb/dataview"
import { VaultService } from "@kb/vault"
import { Console, Effect } from "effect"
import { Argument, Command } from "effect/unstable/cli"

const dashboardPath = Argument.string("path").pipe(
  Argument.withDescription("Markdown dashboard file path relative to the vault root")
)

const DashboardRoot = Command.make("dashboard").pipe(Command.withDescription("Render Dataview dashboard documents"))

export const DashboardCommand = DashboardRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "render",
      { path: dashboardPath },
      Effect.fn(function* ({ path }) {
        const vault = yield* VaultService
        const renderer = yield* MarkdownDataviewRenderer
        const markdown = yield* vault.readText(path)
        const output = yield* renderer.renderDocument(markdown)
        yield* Console.log(output)
      })
    ).pipe(Command.withDescription("Render a markdown dashboard file to stdout"))
  ])
)
