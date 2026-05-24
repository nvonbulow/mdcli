import { CalendarService, VaultService } from "@kb/vault"
import { Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import {
  DataviewEvaluator,
  DataviewFunctionRegistry,
  DataviewParser,
  DataviewProgram,
  DataviewRecordSource,
  DataviewRenderer
} from "@kb/dataview"
import { formatFlag } from "../OutputFormat"

const queryText = Argument.string("query").pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription("Dataview query text")
)

const QueryRoot = Command.make("query").pipe(
  Command.withSharedFlags({
    vault: Flag.string("vault").pipe(Flag.withDescription("Markdown vault root"))
  }),
  Command.withDescription("Run low-level Dataview queries")
)

export const QueryCommand = QueryRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "run",
      { query: queryText, format: formatFlag },
      Effect.fn(function* ({ query, format }) {
        const root = yield* QueryRoot
        const text = query.join(" ")
        const output = yield* Effect.gen(function* () {
          const program = yield* DataviewProgram
          const renderer = yield* DataviewRenderer
          const result = yield* program.run(text)
          return yield* renderer.render(result)
        }).pipe(
          Effect.provide(DataviewProgram.layerNoDeps),
          Effect.provide(DataviewParser.layerNoDeps),
          Effect.provide(DataviewRecordSource.layerNoDeps),
          Effect.provide(DataviewEvaluator.layerNoDeps),
          Effect.provide(DataviewFunctionRegistry.layerNoDeps),
          Effect.provide(CalendarService.layerLive),
          Effect.provide(VaultService.makeLayer({ root: root.vault })),
          Effect.provide(rendererLayer(format))
        )
        yield* Console.log(output)
      })
    ).pipe(Command.withDescription("Run a Dataview query against a vault"))
  ])
)

const rendererLayer = (format: "pretty" | "markdown" | "json") =>
  format === "markdown"
    ? DataviewRenderer.layerMarkdown
    : format === "json"
      ? DataviewRenderer.layerJson
      : DataviewRenderer.layerPretty
