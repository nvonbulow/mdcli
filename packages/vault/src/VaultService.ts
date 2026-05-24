import {
  Cache,
  Chunk,
  Context,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Path,
  Result,
  String as Str,
  Trie
} from "effect"
import type { PlatformError } from "effect/PlatformError"
import * as Glob from "./Glob"
import { MarkdownFile, type MarkdownTree } from "./markdown/MarkdownModel"
import { MarkdownParser } from "./markdown/MarkdownParser"
import type { MarkdownParseError } from "./VaultErrors"
import { VaultIoError } from "./VaultErrors"
import type { VaultScope } from "./VaultScope"

export type VaultServiceShape = {
  readonly readText: (path: string) => Effect.Effect<string, VaultIoError>
  readonly writeText: (path: string, contents: string) => Effect.Effect<void, VaultIoError>
  readonly readMarkdown: (path: string) => Effect.Effect<MarkdownFile, VaultIoError | MarkdownParseError>
  readonly readMarkdownTree: (scope: VaultScope) => Effect.Effect<MarkdownTree, VaultIoError>
}

export class VaultService extends Context.Service<VaultService, VaultServiceShape>()("@kb/vault/VaultService") {
  static makeLayer({ root }: { readonly root: string }) {
    return Layer.effect(VaultService, makeVaultService(root)).pipe(Layer.provide(MarkdownParser.layer))
  }
}

const makeVaultService = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    const parser = yield* MarkdownParser
    const glob = yield* Glob.Glob

    const readText = Effect.fn("VaultService.readText")(function* (path: string) {
      const normalizedPath = normalizePath(path)
      const fullPath = pathService.join(root, normalizedPath)
      return yield* mapIoError("readText", normalizedPath, fs.readFileString(fullPath))
    })

    const markdownCache = yield* Cache.makeWith<string, Result.Result<MarkdownFile, MarkdownParseError>, VaultIoError>(
      (path) =>
        Effect.gen(function* () {
          const contents = yield* readText(path)
          return yield* parser.parse(contents).pipe(
            Effect.match({
              onFailure: Result.fail,
              onSuccess: (parsed) =>
                Result.succeed(
                  new MarkdownFile({
                    path,
                    contents: parsed.contents,
                    mdast: parsed.mdast
                  })
                )
            })
          )
        }),
      {
        capacity: Number.MAX_SAFE_INTEGER,
        timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero)
      }
    )

    const readMarkdown = Effect.fn("VaultService.readMarkdown")(function* (path: string) {
      const normalizedPath = normalizePath(path)
      const cached = yield* Cache.get(markdownCache, normalizedPath)
      if (Result.isFailure(cached)) {
        return yield* Effect.fail(cached.failure)
      }
      return cached.success
    })

    const writeText = Effect.fn("VaultService.writeText")(function* (path: string, contents: string) {
      const normalizedPath = normalizePath(path)
      const fullPath = pathService.join(root, normalizedPath)
      yield* mapIoError("writeText", normalizedPath, fs.writeFileString(fullPath, contents))
      return yield* Cache.invalidate(markdownCache, normalizedPath)
    })

    const readMarkdownTree: VaultServiceShape["readMarkdownTree"] = Effect.fn("VaultService.readMarkdownTree")(
      function* (scope: VaultScope) {
        const patterns = Chunk.toReadonlyArray(Chunk.map(scope.patterns, normalizePath))
        const matches = yield* glob
          .glob(patterns, {
            cwd: root,
            nodir: true,
            dot: true,
            absolute: false
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new VaultIoError({
                  operation: "readMarkdownTree",
                  path: patterns.join(","),
                  message: globErrorMessage(error.cause)
                })
            )
          )
        const markdownFiles = sortedUniqueMarkdownPaths(matches)

        const files = yield* Effect.forEach(markdownFiles, (path) =>
          Cache.get(markdownCache, path).pipe(Effect.map((file) => [path, file] as const))
        )

        return {
          root: "",
          files: Trie.fromIterable(files)
        }
      }
    )

    return VaultService.of({
      readText,
      writeText,
      readMarkdown,
      readMarkdownTree
    })
  })

const mapIoError = <A>(
  operation: string,
  path: string,
  effect: Effect.Effect<A, PlatformError>
): Effect.Effect<A, VaultIoError> =>
  effect.pipe(
    Effect.mapError(
      (error) =>
        new VaultIoError({
          operation,
          path,
          message: error.message
        })
    )
  )

const normalizePath = (path: string): string => Str.replaceAll("\\", "/")(path)
const sortedUniqueMarkdownPaths = (paths: ReadonlyArray<string>): Array<string> => {
  const sorted = paths.map(normalizeMatchedPath).filter(Str.endsWith(".md")).sort()
  const unique: Array<string> = []
  let previous: string | undefined
  for (const path of sorted) {
    if (path !== previous) {
      unique.push(path)
      previous = path
    }
  }
  return unique
}

const normalizeMatchedPath = (path: string): string => {
  const normalized = normalizePath(path)
  return normalized.startsWith("./") ? normalized.slice(2) : normalized
}

const globErrorMessage = (cause: unknown): string =>
  typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string"
    ? cause.message
    : String(cause)
