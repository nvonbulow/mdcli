import { Context, Data, Effect, Layer } from "effect"
import * as GlobLib from "glob"

export class GlobError extends Data.TaggedError("GlobError")<{
  readonly pattern: string | ReadonlyArray<string>
  readonly cause: unknown
}> {}

export type Glob = {
  readonly glob: (
    pattern: string | ReadonlyArray<string>,
    options?: GlobLib.GlobOptions
  ) => Effect.Effect<Array<string>, GlobError>
}

export const Glob: Context.Service<Glob, Glob> = Context.Service("@kb/vault-core/Glob")

export const layer: Layer.Layer<Glob> = Layer.succeed(Glob, {
  glob: (pattern, options) =>
    Effect.tryPromise({
      try: () =>
        GlobLib.glob(typeof pattern === "string" ? pattern : Array.from(pattern), options ?? {}) as Promise<
          Array<string>
        >,
      catch: (cause) => new GlobError({ pattern, cause })
    })
})
