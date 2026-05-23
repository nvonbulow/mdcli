import { Clock, Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { DataviewEngine, dataviewFunctions, Renderer, VaultRecords } from "@kb/dataview"
import { isoDateFromEpochMillis } from "@kb/vault"
import { formatFlag } from "../OutputFormat"

const queryText = Argument.string("query").pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription("Dataview query text")
)

const QueryRoot = Command.make("query").pipe(
  Command.withSharedFlags({
    vault: Flag.string("vault").pipe(Flag.withDescription("Markdown vault root"), Flag.withDefault("vault"))
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
        const engine = yield* DataviewEngine
        const vaultRecords = yield* VaultRecords
        const renderer = yield* Renderer
        const millis = yield* Clock.currentTimeMillis
        const context = { functions: dataviewFunctions(isoDateFromEpochMillis(millis)) }
        const text = query.join(" ")
        const parsed = yield* engine.parse(text)
        const records = yield* vaultRecords.read({ root: root.vault, source: parsed.source, context })
        const result = yield* engine.evaluate(text, parsed, records, context)
        const output = yield* renderer.render(result, format)
        yield* Console.log(output)
      })
    ).pipe(Command.withDescription("Run a Dataview query against a vault"))
  ])
)
