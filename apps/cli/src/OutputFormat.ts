import { DataviewRenderer, type OutputFormat } from "@kb/dataview"
import type * as Layer from "effect/Layer"
import { Flag } from "effect/unstable/cli"

export const formatFlag = Flag.choice("format", ["pretty", "markdown", "json"] as const).pipe(
  Flag.withDescription("Output format: pretty, markdown, or json"),
  Flag.withDefault("pretty")
)

export type { OutputFormat }

export const rendererLayerForFormat = (format: OutputFormat): Layer.Layer<DataviewRenderer> => {
  switch (format) {
    case "pretty":
      return DataviewRenderer.layerPretty
    case "markdown":
      return DataviewRenderer.layerMarkdown
    case "json":
      return DataviewRenderer.layerJson
  }
}
