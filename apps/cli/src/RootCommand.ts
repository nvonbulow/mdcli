import { Command } from "effect/unstable/cli"
import { formatFlag, vaultFlag } from "./OutputFormat"

export const KbRoot = Command.make("kb").pipe(
  Command.withSharedFlags({
    vault: vaultFlag,
    format: formatFlag
  }),
  Command.withDescription("Knowledge-base command line tools")
)
