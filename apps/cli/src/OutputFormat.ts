import { Flag } from "effect/unstable/cli"

export const formatFlag = Flag.choice("format", ["pretty", "markdown", "json"] as const).pipe(
  Flag.withDescription("Output format: pretty, markdown, or json"),
  Flag.withDefault("pretty")
)
