import { layerStdio } from "@kb/mcp-server"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"

export const McpCommand = Command.make(
  "mcp",
  {},
  Effect.fn(function* () {
    yield* Layer.launch(layerStdio)
  })
).pipe(Command.withDescription("Run the MCP server over stdio"))
