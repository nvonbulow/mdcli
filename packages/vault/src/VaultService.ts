import { Array as Arr, Context, Effect, FileSystem, Layer, Path, String as Str } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { Markdown } from "./markdown/Markdown"
import { MarkdownParser } from "./markdown/MarkdownParser"
import type { ParsedTask } from "./TaskModel"
import { parsedTasksFromMarkdown } from "./TaskMarkdownParser"
import type { MarkdownParseError, TaskParseError } from "./VaultErrors"
import { VaultIoError } from "./VaultErrors"

export type VaultMarkdownFile = {
  readonly path: string
  readonly contents: string
}

type VaultServiceShape = {
  readonly readText: (path: string) => Effect.Effect<string, VaultIoError>
  readonly writeText: (path: string, contents: string) => Effect.Effect<void, VaultIoError>
  readonly readMarkdownTree: (source: string) => Effect.Effect<ReadonlyArray<VaultMarkdownFile>, VaultIoError>
  readonly readTasks: (
    source: string
  ) => Effect.Effect<ReadonlyArray<ParsedTask>, VaultIoError | TaskParseError | MarkdownParseError>
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
      const fullPath = pathService.join(root, path)
      return yield* mapIoError("readText", path, fs.readFileString(fullPath))
    })

    const writeText = Effect.fn("VaultService.writeText")(function* (path: string, contents: string) {
      const fullPath = pathService.join(root, path)
      return yield* mapIoError("writeText", path, fs.writeFileString(fullPath, contents))
    })

    const readMarkdownTree = Effect.fn("VaultService.readMarkdownTree")(function* (source: string) {
      const sourceRoot = pathService.join(root, source)
      const entries = yield* mapIoError("readMarkdownTree", source, fs.readDirectory(sourceRoot, { recursive: true }))
      const markdownFiles = entries.filter((entry) => Str.endsWith(".md")(entry))

      return yield* Effect.forEach(markdownFiles, (entry) => {
        const fullPath = pathService.join(sourceRoot, entry)
        const sourcePath = normalizePath(pathService.join(source, entry))
        return mapIoError("readMarkdownTree", sourcePath, fs.readFileString(fullPath)).pipe(
          Effect.map((contents): VaultMarkdownFile => ({ path: sourcePath, contents }))
        )
      })
    })

    const readTasks = Effect.fn("VaultService.readTasks")(function* (source: string) {
      const markdownFiles = yield* readMarkdownTree(source)
      const parsed = yield* Effect.forEach(markdownFiles, (file) =>
        Effect.gen(function* () {
          const markdownFile = yield* parser.parse(file.contents)
          return parsedTasksFromMarkdown(Markdown.getTasks(markdownFile), file.contents, file.path)
        })
      )
      return Arr.flatten(parsed)
    })

    return VaultService.of({
      readText,
      writeText,
      readMarkdownTree,
      readTasks
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
