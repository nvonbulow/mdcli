import { Cache, Context, Duration, Effect, Exit, FileSystem, Layer, Path, Result, String as Str, Trie } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { MarkdownFile, type MarkdownTree } from "./markdown/MarkdownModel"
import { MarkdownParser } from "./markdown/MarkdownParser"
import type { MarkdownParseError } from "./VaultErrors"
import { VaultIoError } from "./VaultErrors"

type VaultServiceShape = {
  readonly readText: (path: string) => Effect.Effect<string, VaultIoError>
  readonly writeText: (path: string, contents: string) => Effect.Effect<void, VaultIoError>
  readonly readMarkdown: (path: string) => Effect.Effect<MarkdownFile, VaultIoError | MarkdownParseError>
  readonly readMarkdownTree: (source: string) => Effect.Effect<MarkdownTree, VaultIoError>
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

    const readMarkdownTree = Effect.fn("VaultService.readMarkdownTree")(function* (source: string) {
      const normalizedSource = normalizePath(source)
      const sourceRoot = pathService.join(root, normalizedSource)
      const entries = yield* mapIoError(
        "readMarkdownTree",
        normalizedSource,
        fs.readDirectory(sourceRoot, { recursive: true })
      )
      const markdownFiles = entries.filter((entry) => Str.endsWith(".md")(entry))

      const files = yield* Effect.forEach(markdownFiles, (entry) => {
        const sourcePath = normalizePath(pathService.join(normalizedSource, entry))
        return Cache.get(markdownCache, sourcePath).pipe(Effect.map((file) => [sourcePath, file] as const))
      })

      return {
        root: normalizedSource,
        files: Trie.fromIterable(files)
      }
    })

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
