import { Clock, Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { DataviewEngine, dataviewFunctions, recordsFromResult, tasksFromRecords, VaultRecords } from "@kb/dataview"
import { isoDateFromEpochMillis, renderTaskList } from "@kb/vault"

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
      { query: queryText },
      Effect.fn(function* ({ query }) {
        const root = yield* QueryRoot
        const engine = yield* DataviewEngine
        const vaultRecords = yield* VaultRecords
        const millis = yield* Clock.currentTimeMillis
        const context = { functions: dataviewFunctions(isoDateFromEpochMillis(millis)) }
        const text = query.join(" ")
        const parsed = yield* engine.parse(text)
        const records = yield* vaultRecords.read({ root: root.vault, source: parsed.source, context })
        const result = yield* engine.evaluate(text, parsed, records, context)
        yield* Console.log(renderTaskList(tasksFromRecords(recordsFromResult(result))))
      })
    ).pipe(Command.withDescription("Run a Dataview query against a vault"))
  ])
)
