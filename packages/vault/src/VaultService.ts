import { MarkdownProcessor, type MarkdownParseError, type MarkdownStringifyError } from "@kb/markdown-ast"
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
import { MarkdownFile, type MarkdownTree } from "./markdown/MarkdownModel"
import { MarkdownParser } from "./markdown/MarkdownParser"
import { VaultIoError } from "./VaultErrors"
import { VaultScope } from "./VaultScope"
import {
  fencedBlockRecordsForFile,
  frontmatterRecordsForFile,
  headingRecordsForFile,
  linkRecordsForFile,
  listItemRecordsForFile,
  noteRecordsForFile,
  tagRecordsForFile,
  taskRecordsForFile,
  Vault,
  type VaultDiagnostic,
  type VaultFencedBlockRecord,
  type VaultFrontmatterRecord,
  type VaultHeadingRecord,
  type VaultLinkRecord,
  type VaultListItemRecord,
  type VaultNoteRecord,
  type VaultProjectionMethods,
  type VaultShape,
  type VaultTagRecord,
  type VaultTaskRecord
} from "./Vault"

export type VaultServiceShape = {
  readonly readText: (path: string) => Effect.Effect<string, VaultIoError>
  readonly writeText: (path: string, contents: string) => Effect.Effect<void, VaultIoError>
  readonly readMarkdown: (path: string) => Effect.Effect<MarkdownFile, VaultIoError | MarkdownParseError>
  readonly readMarkdownTree: (scope: VaultScope) => Effect.Effect<MarkdownTree, VaultIoError>
  readonly scoped: (scope: VaultScope) => Effect.Effect<VaultShape, VaultIoError>
}

export class VaultService extends Context.Service<VaultService, VaultServiceShape>()("@kb/vault/VaultService") {
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
        const markdownFiles = filterIgnoredMarkdownPaths(
          sortedUniqueMarkdownPaths(matches),
          yield* Cache.get(kbIgnoreCache, "")
        )

        const files = yield* Effect.forEach(markdownFiles, (path) =>
          Cache.get(markdownCache, path).pipe(Effect.map((file) => [path, file] as const))
        )

        return {
          root: "",
          files: Trie.fromIterable(files)
        }
      }
    )

    const [noteFileCache, noteScopeCache] = yield* makeProjectionCache(readMarkdown, readMarkdownTree, noteRecordsForFile)
    const [frontmatterFileCache, frontmatterScopeCache] = yield* makeProjectionCache(
      readMarkdown,
      readMarkdownTree,
      frontmatterRecordsForFile
    )
    const [headingFileCache, headingScopeCache] = yield* makeProjectionCache(
      readMarkdown,
      readMarkdownTree,
      headingRecordsForFile
    )
    const [linkFileCache, linkScopeCache] = yield* makeProjectionCache(readMarkdown, readMarkdownTree, linkRecordsForFile)
    const [tagFileCache, tagScopeCache] = yield* makeProjectionCache(readMarkdown, readMarkdownTree, tagRecordsForFile)
    const [listItemFileCache, listItemScopeCache] = yield* makeProjectionCache(
      readMarkdown,
      readMarkdownTree,
      listItemRecordsForFile
    )
    const [taskFileCache, taskScopeCache] = yield* makeProjectionCacheEffect(readMarkdown, readMarkdownTree, (path, file) =>
      taskRecordsForFile(path, file).pipe(Effect.provideService(MarkdownProcessor, markdownProcessor))
    )
    const [fencedBlockFileCache, fencedBlockScopeCache] = yield* makeProjectionCache(
      readMarkdown,
      readMarkdownTree,
      fencedBlockRecordsForFile
    )
    const diagnosticScopeCache = yield* Cache.makeWith<string, Chunk.Chunk<VaultDiagnostic>, VaultIoError>(
      (key) => diagnosticsForScope(readMarkdownTree, scopeFromKey(key)),
      { capacity: Number.MAX_SAFE_INTEGER }
    )

    const writeText = Effect.fn("VaultService.writeText")(function* (path: string, contents: string) {
      const normalizedPath = normalizePath(path)
      const fullPath = pathService.join(root, normalizedPath)
      yield* mapIoError("writeText", normalizedPath, fs.writeFileString(fullPath, contents))
      if (normalizedPath === ".kbignore") {
        yield* Cache.invalidate(kbIgnoreCache, "")
      }
      yield* Cache.invalidate(markdownCache, normalizedPath)
      yield* Cache.invalidate(noteFileCache, normalizedPath)
      yield* Cache.invalidate(frontmatterFileCache, normalizedPath)
      yield* Cache.invalidate(headingFileCache, normalizedPath)
      yield* Cache.invalidate(linkFileCache, normalizedPath)
      yield* Cache.invalidate(tagFileCache, normalizedPath)
      yield* Cache.invalidate(listItemFileCache, normalizedPath)
      yield* Cache.invalidate(taskFileCache, normalizedPath)
      yield* Cache.invalidate(fencedBlockFileCache, normalizedPath)
      yield* Cache.invalidateAll(noteScopeCache)
      yield* Cache.invalidateAll(frontmatterScopeCache)
      yield* Cache.invalidateAll(headingScopeCache)
      yield* Cache.invalidateAll(linkScopeCache)
      yield* Cache.invalidateAll(tagScopeCache)
      yield* Cache.invalidateAll(listItemScopeCache)
      yield* Cache.invalidateAll(taskScopeCache)
      yield* Cache.invalidateAll(fencedBlockScopeCache)
      return yield* Cache.invalidateAll(diagnosticScopeCache)
    })

    const scoped = Effect.fn("VaultService.scoped")(function* (scope: VaultScope) {
      const tree = yield* readMarkdownTree(scope)
      return yield* Vault.make({
        scope,
        tree,
        projections: projectionsForScope(
          scope,
          noteScopeCache,
          frontmatterScopeCache,
          headingScopeCache,
          linkScopeCache,
          tagScopeCache,
          listItemScopeCache,
          taskScopeCache,
          fencedBlockScopeCache,
          diagnosticScopeCache
        )
      }).pipe(Effect.provideService(MarkdownProcessor, markdownProcessor))
    })

    return VaultService.of({
      readText,
      writeText,
      readMarkdown,
      readMarkdownTree,
      scoped
    })
  })

type ProjectionFileCache<Record, Error = never> = Cache.Cache<
  string,
  Chunk.Chunk<Record>,
  VaultIoError | MarkdownParseError | Error
>
type ProjectionScopeCache<Record, Error = never> = Cache.Cache<string, Chunk.Chunk<Record>, VaultIoError | Error>

const makeProjectionCache = <Record>(
  readMarkdown: VaultServiceShape["readMarkdown"],
  readMarkdownTree: VaultServiceShape["readMarkdownTree"],
  project: (path: string, file: MarkdownFile) => Chunk.Chunk<Record>
): Effect.Effect<readonly [ProjectionFileCache<Record>, ProjectionScopeCache<Record>]> =>
  makeProjectionCacheEffect(readMarkdown, readMarkdownTree, (path, file) => Effect.succeed(project(path, file)))

const makeProjectionCacheEffect = <Record, Error>(
  readMarkdown: VaultServiceShape["readMarkdown"],
  readMarkdownTree: VaultServiceShape["readMarkdownTree"],
  project: (path: string, file: MarkdownFile) => Effect.Effect<Chunk.Chunk<Record>, Error>
): Effect.Effect<readonly [ProjectionFileCache<Record, Error>, ProjectionScopeCache<Record, Error>]> =>
  Effect.gen(function* () {
    const fileCache = yield* Cache.makeWith<string, Chunk.Chunk<Record>, VaultIoError | MarkdownParseError | Error>(
      (path) => Effect.flatMap(readMarkdown(path), (file) => project(path, file)),
      { capacity: Number.MAX_SAFE_INTEGER }
    )
    const scopeCache = yield* Cache.makeWith<string, Chunk.Chunk<Record>, VaultIoError | Error>(
      (key) => recordsForScope(readMarkdownTree, fileCache, scopeFromKey(key)),
      { capacity: Number.MAX_SAFE_INTEGER }
    )
    return [fileCache, scopeCache] as const
  })

const recordsForScope = <Record, Error>(
  readMarkdownTree: VaultServiceShape["readMarkdownTree"],
  fileCache: ProjectionFileCache<Record, Error>,
  scope: VaultScope
): Effect.Effect<Chunk.Chunk<Record>, VaultIoError | Error> =>
  Effect.gen(function* () {
    const tree = yield* readMarkdownTree(scope)
    let records = Chunk.empty<Record>()
    for (const [path, result] of Trie.entries(tree.files)) {
      if (pathMatchesScope(path, scope) && Result.isSuccess(result)) {
        const projected = yield* Cache.get(fileCache, path).pipe(
          Effect.catchIf(
            isMarkdownParseError,
            () => Effect.succeed(Chunk.empty<Record>())
          )
        )
        records = Chunk.appendAll(records, projected)
      }
    }
    return records
  })

const diagnosticsForScope = (
  readMarkdownTree: VaultServiceShape["readMarkdownTree"],
  scope: VaultScope
): Effect.Effect<Chunk.Chunk<VaultDiagnostic>, VaultIoError> =>
  Effect.map(readMarkdownTree(scope), (tree) => {
    let diagnostics = Chunk.empty<VaultDiagnostic>()
    for (const [path, result] of Trie.entries(tree.files)) {
      if (pathMatchesScope(path, scope) && Result.isFailure(result)) {
        diagnostics = Chunk.append(diagnostics, { path, message: result.failure.message, cause: result.failure })
      }
    }
    return diagnostics
  })

const projectionsForScope = (
  scope: VaultScope,
  noteScopeCache: ProjectionScopeCache<VaultNoteRecord>,
  frontmatterScopeCache: ProjectionScopeCache<VaultFrontmatterRecord>,
  headingScopeCache: ProjectionScopeCache<VaultHeadingRecord>,
  linkScopeCache: ProjectionScopeCache<VaultLinkRecord>,
  tagScopeCache: ProjectionScopeCache<VaultTagRecord>,
  listItemScopeCache: ProjectionScopeCache<VaultListItemRecord>,
  taskScopeCache: ProjectionScopeCache<VaultTaskRecord, MarkdownStringifyError>,
  fencedBlockScopeCache: ProjectionScopeCache<VaultFencedBlockRecord>,
  diagnosticScopeCache: ProjectionScopeCache<VaultDiagnostic>
): VaultProjectionMethods => ({
  notes: (narrowScope?: VaultScope) => Cache.get(noteScopeCache, scopeKey(narrowScope ?? scope)),
  frontmatter: (narrowScope?: VaultScope) => Cache.get(frontmatterScopeCache, scopeKey(narrowScope ?? scope)),
  headings: (narrowScope?: VaultScope) => Cache.get(headingScopeCache, scopeKey(narrowScope ?? scope)),
  links: (narrowScope?: VaultScope) => Cache.get(linkScopeCache, scopeKey(narrowScope ?? scope)),
  tags: (narrowScope?: VaultScope) => Cache.get(tagScopeCache, scopeKey(narrowScope ?? scope)),
  listItems: (narrowScope?: VaultScope) => Cache.get(listItemScopeCache, scopeKey(narrowScope ?? scope)),
  tasks: (narrowScope?: VaultScope) => Cache.get(taskScopeCache, scopeKey(narrowScope ?? scope)),
  fencedBlocks: (narrowScope?: VaultScope) => Cache.get(fencedBlockScopeCache, scopeKey(narrowScope ?? scope)),
  diagnostics: (narrowScope?: VaultScope) => Cache.get(diagnosticScopeCache, scopeKey(narrowScope ?? scope))
})

const isMarkdownParseError = (error: unknown): error is MarkdownParseError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  (error as { readonly _tag?: unknown })._tag === "MarkdownParseError"

const pathMatchesScope = (path: string, scope: VaultScope): boolean => {
  for (const pattern of scope.patterns) {
    if (pattern === "**/*.md" || pattern === path) {
      return true
    }
    if (pattern.endsWith("/**/*.md") && path.startsWith(pattern.slice(0, -"/**/*.md".length) + "/")) {
      return true
    }
    if (pattern.endsWith("*.md") && path.startsWith(pattern.slice(0, -"*.md".length))) {
      return true
    }
  }
  return false
}

const scopeKey = (scope: VaultScope): string => Chunk.toReadonlyArray(scope.patterns).join("\u0000")
const scopeFromKey = (key: string): VaultScope =>
  new VaultScope({ patterns: Chunk.fromIterable(key.length === 0 ? [] : key.split("\u0000")) })

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

const readKbIgnore = (readText: VaultServiceShape["readText"]): Effect.Effect<ReadonlyArray<KbIgnoreRule>, VaultIoError> =>
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
