import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { DataviewRenderer, renderDataviewResult, type OutputFormat } from "./DataviewRenderer"
import type { DataviewRenderError } from "./DataviewErrors"
import type { DataviewResult } from "./DataviewResult"

export type RendererService = {
  readonly render: (result: DataviewResult, format: OutputFormat) => Effect.Effect<string, DataviewRenderError>
}

export class Renderer extends Context.Service<Renderer, RendererService>()("@kb/dataview/Renderer") {}

export const makeRenderer: Effect.Effect<RendererService> = Effect.sync(() =>
  Renderer.of({
    render: Effect.fn("Renderer.render")((result: DataviewResult, format: OutputFormat) =>
      Effect.succeed(renderDataviewResult(result, format))
    )
  })
)

export const rendererLayer: Layer.Layer<Renderer> = Layer.effect(Renderer, makeRenderer)

export const rendererLayerPretty: Layer.Layer<DataviewRenderer> = DataviewRenderer.layerPretty
export const rendererLayerMarkdown: Layer.Layer<DataviewRenderer> = DataviewRenderer.layerMarkdown
export const rendererLayerJson: Layer.Layer<DataviewRenderer> = DataviewRenderer.layerJson
