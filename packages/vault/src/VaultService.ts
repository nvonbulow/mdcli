import { MarkdownProcessor, type MarkdownParseError } from "@kb/markdown-ast"
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
import { Minimatch } from "minimatch"
import * as Glob from "./Glob"
import { MarkdownFile } from "./markdown/MarkdownModel"
import { MarkdownParser } from "./markdown/MarkdownParser"
import { VaultIoError } from "./VaultErrors"
import { VaultScope } from "./VaultScope"
import { Vault, type VaultFiles } from "./Vault"

export interface VaultService {
  readonly readText: (path: string) => Effect.Effect<string, VaultIoError>
  readonly writeText: (path: string, contents: string) => Effect.Effect<void, VaultIoError>
  readonly readMarkdown: (path: string) => Effect.Effect<MarkdownFile, VaultIoError | MarkdownParseError>
  readonly readMarkdownFiles: (scope: VaultScope) => Effect.Effect<VaultFiles, VaultIoError>
  readonly scoped: (scope: VaultScope) => Effect.Effect<Vault, VaultIoError>
}

export class VaultService extends Context.Service<VaultService, VaultService>()("@kb/vault-core/VaultService") {
  static makeLayer({ root }: { readonly root: string }) {
    return Layer.effect(VaultService, makeVaultService(root)).pipe(
      Layer.provide(Layer.mergeAll(MarkdownParser.layer, MarkdownProcessor.layer))
    )
  }
}

const makeVaultService = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    const parser = yield* MarkdownParser
    const markdownProcessor = yield* MarkdownProcessor
    const glob = yield* Glob.Glob

    const readText = Effect.fn("VaultService.readText")(function* (path: string) {
      const normalizedPath = normalizePath(path)
      const fullPath = pathService.join(root, normalizedPath)
      return yield* mapIoError("readText", normalizedPath, fs.readFileString(fullPath))
    })

    const kbIgnoreCache = yield* Cache.makeWith<string, ReadonlyArray<KbIgnoreRule>, VaultIoError>(
      () => readKbIgnore(readText),
      { capacity: 1 }
    )

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

    const readMarkdownFiles: VaultService["readMarkdownFiles"] = Effect.fn("VaultService.readMarkdownFiles")(
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
                  operation: "readMarkdownFiles",
                  path: patterns.join(","),
                  message: globErrorMessage(error.cause)
                })
            )
          )
        const markdownFiles = filterIgnoredMarkdownPaths(
          sortedUniqueMarkdownPaths(matches),
          yield* Cache.get(kbIgnoreCache, "")
        )

        const files = yield* Effect.forEach(markdownFiles, (path) =>
          Cache.get(markdownCache, path).pipe(Effect.map((file) => [path, file] as const))
        )

        return Trie.fromIterable(files)
      }
    )


    const writeText = Effect.fn("VaultService.writeText")(function* (path: string, contents: string) {
      const normalizedPath = normalizePath(path)
      const fullPath = pathService.join(root, normalizedPath)
      yield* mapIoError("writeText", normalizedPath, fs.writeFileString(fullPath, contents))
      if (normalizedPath === ".kbignore") {
        yield* Cache.invalidate(kbIgnoreCache, "")
      }
      yield* Cache.invalidate(markdownCache, normalizedPath)
    })

    const scoped = Effect.fn("VaultService.scoped")(function* (scope: VaultScope) {
      const files = yield* readMarkdownFiles(scope)
      return yield* Vault.make({
        scope,
        files
      }).pipe(Effect.provideService(MarkdownProcessor, markdownProcessor))
    })

    return VaultService.of({
      readText,
      writeText,
      readMarkdown,
      readMarkdownFiles,
      scoped
    } as unknown as VaultService)
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

type KbIgnoreRule = {
  readonly negated: boolean
  readonly matcher: Minimatch
}

const readKbIgnore = (readText: VaultService["readText"]): Effect.Effect<ReadonlyArray<KbIgnoreRule>, VaultIoError> =>
  readText(".kbignore").pipe(
    Effect.catchIf(isMissingKbIgnore, () => Effect.succeed("")),
    Effect.map(parseKbIgnore)
  )

const parseKbIgnore = (contents: string): ReadonlyArray<KbIgnoreRule> => {
  const rules: Array<KbIgnoreRule> = []
  const lines = contents.split("\n")
  for (const line of lines) {
    const rule = parseKbIgnoreLine(line)
    if (rule !== undefined) {
      rules.push(rule)
    }
  }
  return rules
}

const parseKbIgnoreLine = (line: string): KbIgnoreRule | undefined => {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return undefined
  }
  const negated = trimmed.startsWith("!")
  const pattern = negated ? trimmed.slice(1) : trimmed
  if (pattern.length === 0) {
    return undefined
  }
  return {
    negated,
    matcher: new Minimatch(normalizeKbIgnorePattern(pattern), {
      dot: true,
      matchBase: !pattern.includes("/")
    })
  }
}

const filterIgnoredMarkdownPaths = (
  paths: ReadonlyArray<string>,
  rules: ReadonlyArray<KbIgnoreRule>
): Array<string> => {
  if (rules.length === 0) {
    return Array.from(paths)
  }
  return paths.filter((path) => !isIgnoredPath(path, rules))
}

const isIgnoredPath = (path: string, rules: ReadonlyArray<KbIgnoreRule>): boolean => {
  let ignored = false
  for (const rule of rules) {
    if (rule.matcher.match(path)) {
      ignored = !rule.negated
    }
  }
  return ignored
}

const normalizeKbIgnorePattern = (pattern: string): string => {
  const normalized = normalizePath(pattern)
  const unrooted = normalized.startsWith("/") ? normalized.slice(1) : normalized
  return unrooted.endsWith("/") ? `${unrooted}**` : unrooted
}

const isMissingKbIgnore = (error: VaultIoError): boolean =>
  error.operation === "readText" && error.path === ".kbignore" && /ENOENT|no such file|not\s*found/i.test(error.message)

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
