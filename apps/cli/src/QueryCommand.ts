import { DataviewProgram, DataviewRenderer } from "@kb/dataview"
import { Console, Effect } from "effect"
import { Argument, Command } from "effect/unstable/cli"

const queryText = Argument.string("query").pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription("Dataview query text")
)

const QueryRoot = Command.make("query").pipe(Command.withDescription("Run low-level Dataview queries"))

export const QueryCommand = QueryRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "run",
      { query: queryText },
      Effect.fn(function* ({ query }) {
        const text = query.join(" ")
        const program = yield* DataviewProgram
        const renderer = yield* DataviewRenderer
        const result = yield* program.run(text)
        const output = yield* renderer.render(result)
        yield* Console.log(output)
      })
    ).pipe(Command.withDescription("Run a Dataview query against a vault"))
  ])
)
