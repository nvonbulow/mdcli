import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { renderDataviewResult, type OutputFormat } from "./DataviewRenderer"
import type { DataviewResult } from "./DataviewResult"

export type RendererService = {
  readonly render: (result: DataviewResult, format: OutputFormat) => Effect.Effect<string>
}

export class Renderer extends Context.Service<Renderer, RendererService>()("@kb/dataview/Renderer") {}

export const makeRenderer: Effect.Effect<RendererService> = Effect.succeed(
  Renderer.of({
    render: (result, format) => Effect.succeed(renderDataviewResult(result, format))
  })
)

export const rendererLayer: Layer.Layer<Renderer> = Layer.effect(Renderer, makeRenderer)
