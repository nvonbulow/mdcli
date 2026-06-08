import type { MarkdownStringifyError } from "@kb/markdown-ast"
import { Chunk, Context, Effect, Layer, String as Str } from "effect"
import {
  ArchiveHeadingCheckAnalyzer,
  DumpInboxCheckAnalyzer,
  DuplicateHeadingCheckAnalyzer,
  LinkIntegrityCheckAnalyzer,
  TaskMetadataCheckAnalyzer,
  TitleDriftCheckAnalyzer,
  VaultDiagnosticsCheckAnalyzer
} from "./CheckAnalyzers"
import type { CheckAnalyzer } from "./CheckAnalyzers"
import { VaultService, type VaultHeadingRecord, type VaultIoError, type VaultScope, type VaultShape } from "@kb/vault-core"
import type * as VaultCore from "@kb/vault-core"
import { isArchivePath, normalizeKey } from "./CheckAnalyzerUtils"
import { CheckContext, CheckFinding, CheckReport } from "./CheckModel"
import type { CheckContextShape, CheckIndexes } from "./CheckModel"

export type CheckServiceError = VaultIoError | VaultCore.Glob.GlobError | MarkdownStringifyError
const serviceRegistry = new WeakMap<
  CheckServiceShape,
  { readonly scopedVaultForScope: ScopedVaultForScope; readonly analyzers: ReadonlyArray<CheckAnalyzer> }
>()

export type CheckServiceShape = {
  readonly run: (scope: VaultScope) => Effect.Effect<CheckReport, CheckServiceError>
  readonly runFile: (scope: VaultScope, path: string) => Effect.Effect<CheckReport, CheckServiceError>
  readonly runFiles: (scope: VaultScope, paths: Chunk.Chunk<string>) => Effect.Effect<CheckReport, CheckServiceError>
}
type ScopedVaultForScope = (scope: VaultScope) => Effect.Effect<VaultShape, CheckServiceError>

export class CheckService extends Context.Service<CheckService, CheckServiceShape>()("@kb/vault-checks/CheckService") {
  static readonly layerNoDeps: Layer.Layer<CheckService, never, VaultService> = Layer.effect(
    CheckService,
    Effect.gen(function* () {
      const vault = yield* VaultService
      const vaultDiagnostics = yield* VaultDiagnosticsCheckAnalyzer
      const linkIntegrity = yield* LinkIntegrityCheckAnalyzer
      const duplicateHeading = yield* DuplicateHeadingCheckAnalyzer
      const titleDrift = yield* TitleDriftCheckAnalyzer
      const archiveHeading = yield* ArchiveHeadingCheckAnalyzer
      const dumpInbox = yield* DumpInboxCheckAnalyzer
      const taskMetadata = yield* TaskMetadataCheckAnalyzer
      return makeWithScopedVault(
        vault.scoped,
        vaultDiagnostics,
        linkIntegrity,
        duplicateHeading,
        titleDrift,
        archiveHeading,
        dumpInbox,
        taskMetadata
      )
    })
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        VaultDiagnosticsCheckAnalyzer.layer,
        LinkIntegrityCheckAnalyzer.layer,
        DuplicateHeadingCheckAnalyzer.layer,
        TitleDriftCheckAnalyzer.layer,
        ArchiveHeadingCheckAnalyzer.layer,
        DumpInboxCheckAnalyzer.layer,
        TaskMetadataCheckAnalyzer.layer
      )
    )
  )

  static readonly layer: Layer.Layer<CheckService, never, VaultService> = CheckService.layerNoDeps
}

export const make = (...analyzers: ReadonlyArray<CheckAnalyzer>): CheckServiceShape =>
  makeWithScopedVault(
    (scope) =>
      Effect.gen(function* () {
        const vault = yield* VaultService
        return yield* vault.scoped(scope)
      }) as Effect.Effect<VaultShape, CheckServiceError>,
    ...analyzers
  )

const makeWithScopedVault = (
  scopedVaultForScope: ScopedVaultForScope,
  ...analyzers: ReadonlyArray<CheckAnalyzer>
): CheckServiceShape => {
  const runScope = Effect.fn("CheckService.runScope")(function* (
    scope: VaultScope,
    selectedPathsForVault: (vault: VaultShape) => Effect.Effect<Chunk.Chunk<string>, CheckServiceError>
  ) {
    const vault = yield* scopedVaultForScope(scope)
    const selectedPaths = uniquePaths(yield* selectedPathsForVault(vault))
    const selected = new Set(Chunk.toReadonlyArray(selectedPaths))
    const context = yield* checkContext(scope, vault, (path) => selected.has(normalizePath(path)))
    const findings = yield* Effect.forEach(selectedPaths, (path) =>
      Effect.forEach(analyzers, (analyzer) => analyzer.analyzeFile(path)).pipe(
        Effect.map((chunks) => Chunk.flatten(Chunk.fromIterable(chunks)))
      )
    ).pipe(
      Effect.map((chunks) => Chunk.flatten(Chunk.fromIterable(chunks))),
      Effect.provideService(CheckContext, context)
    )

    return new CheckReport({ scope, vault, findings: sortFindings(findings) })
  })

  const service = CheckService.of({
    run: (scope) => runScope(scope, selectedPathsFromVault),
    runFile: (scope, path) => runScope(scope, () => Effect.succeed(uniquePaths(Chunk.of(normalizePath(path))))),
    runFiles: (scope, paths) => runScope(scope, () => Effect.succeed(uniquePaths(Chunk.map(paths, normalizePath))))
  })
  serviceRegistry.set(service, { scopedVaultForScope, analyzers })
  return service
}

export const addCheck =
  (checkImplementation: CheckAnalyzer) =>
  (self: CheckServiceShape): CheckServiceShape => {
    const registered = serviceRegistry.get(self)
    return registered === undefined
      ? make(checkImplementation)
      : makeWithScopedVault(registered.scopedVaultForScope, ...registered.analyzers, checkImplementation)
  }

export const all = (
  vaultDiagnostics: CheckAnalyzer,
  linkIntegrity: CheckAnalyzer,
  duplicateHeading: CheckAnalyzer,
  titleDrift: CheckAnalyzer,
  archiveHeading: CheckAnalyzer,
  dumpInbox: CheckAnalyzer,
  taskMetadata: CheckAnalyzer
): CheckServiceShape =>
  make(vaultDiagnostics, linkIntegrity, duplicateHeading, titleDrift, archiveHeading, dumpInbox, taskMetadata)

export const linksOnly = (linkIntegrity: CheckAnalyzer): CheckServiceShape => make(linkIntegrity)

export const headingsBundle = (
  duplicateHeading: CheckAnalyzer,
  titleDrift: CheckAnalyzer,
  archiveHeading: CheckAnalyzer
): CheckServiceShape => make(duplicateHeading, titleDrift, archiveHeading)

export const tasksOnly = (taskMetadata: CheckAnalyzer): CheckServiceShape => make(taskMetadata)

export const dumpOnly = (dumpInbox: CheckAnalyzer): CheckServiceShape => make(dumpInbox)

export const layerAll: Layer.Layer<CheckService, never, VaultService> = CheckService.layer

export const layerLinksOnly: Layer.Layer<CheckService, never, VaultService> = Layer.effect(
  CheckService,
  Effect.gen(function* () {
    const vault = yield* VaultService
    const linkIntegrity = yield* LinkIntegrityCheckAnalyzer
    return makeWithScopedVault(vault.scoped, linkIntegrity)
  })
).pipe(Layer.provide(LinkIntegrityCheckAnalyzer.layer))

export const layerHeadingsBundle: Layer.Layer<CheckService, never, VaultService> = Layer.effect(
  CheckService,
  Effect.gen(function* () {
    const vault = yield* VaultService
    const duplicateHeading = yield* DuplicateHeadingCheckAnalyzer
    const titleDrift = yield* TitleDriftCheckAnalyzer
    const archiveHeading = yield* ArchiveHeadingCheckAnalyzer
    return makeWithScopedVault(vault.scoped, duplicateHeading, titleDrift, archiveHeading)
  })
).pipe(
  Layer.provide(
    Layer.mergeAll(
      DuplicateHeadingCheckAnalyzer.layer,
      TitleDriftCheckAnalyzer.layer,
      ArchiveHeadingCheckAnalyzer.layer
    )
  )
)

export const layerTasksOnly: Layer.Layer<CheckService, never, VaultService> = Layer.effect(
  CheckService,
  Effect.gen(function* () {
    const vault = yield* VaultService
    const taskMetadata = yield* TaskMetadataCheckAnalyzer
    return makeWithScopedVault(vault.scoped, taskMetadata)
  })
).pipe(Layer.provide(TaskMetadataCheckAnalyzer.layer))

export const layerDumpOnly: Layer.Layer<CheckService, never, VaultService> = Layer.effect(
  CheckService,
  Effect.gen(function* () {
    const vault = yield* VaultService
    const dumpInbox = yield* DumpInboxCheckAnalyzer
    return makeWithScopedVault(vault.scoped, dumpInbox)
  })
).pipe(Layer.provide(DumpInboxCheckAnalyzer.layer))

const selectedPathsFromVault = (vault: VaultShape): Effect.Effect<Chunk.Chunk<string>, VaultIoError> =>
  Effect.gen(function* () {
    const notes = yield* vault.notes()
    const diagnostics = yield* vault.diagnostics()
    return uniquePaths(
      Chunk.appendAll(
        Chunk.map(notes, (note) => normalizePath(note.path)),
        Chunk.map(diagnostics, (diagnostic) => normalizePath(diagnostic.path))
      )
    )
  })

const checkContext = (
  scope: VaultScope,
  vault: VaultShape,
  selected: (path: string) => boolean
): Effect.Effect<CheckContextShape, VaultIoError> =>
  Effect.gen(function* () {
    return CheckContext.of({
      scope,
      vault,
      selected,
      indexes: yield* indexesFromVault(vault)
    })
  })

const indexesFromVault = (vault: VaultShape): Effect.Effect<CheckIndexes, VaultIoError> =>
  Effect.gen(function* () {
    const notes = yield* vault.notes()
    const headings = yield* vault.headings()
    const notesByKey = new Map<string, Chunk.Chunk<string>>()
    const basenameByKey = new Map<string, Chunk.Chunk<string>>()
    const h1ByKey = new Map<string, Chunk.Chunk<string>>()
    const activeH1ByKey = new Map<string, Chunk.Chunk<string>>()
    const archiveH1ByKey = new Map<string, Chunk.Chunk<string>>()

    for (const note of notes) {
      appendIndex(notesByKey, normalizeKey(note.path), note.path)
      appendIndex(basenameByKey, normalizeKey(basename(note.path)), note.path)
    }

    for (const heading of headings) {
      appendHeadingIndexes(heading, h1ByKey, activeH1ByKey, archiveH1ByKey)
    }

    return {
      notesByKey: sortIndex(notesByKey),
      basenameByKey: sortIndex(basenameByKey),
      h1ByKey: sortIndex(h1ByKey),
      activeH1ByKey: sortIndex(activeH1ByKey),
      archiveH1ByKey: sortIndex(archiveH1ByKey)
    }
  })

const appendHeadingIndexes = (
  heading: VaultHeadingRecord,
  h1ByKey: Map<string, Chunk.Chunk<string>>,
  activeH1ByKey: Map<string, Chunk.Chunk<string>>,
  archiveH1ByKey: Map<string, Chunk.Chunk<string>>
): void => {
  if (heading.depth !== 1) {
    return
  }
  const key = normalizeKey(heading.text)
  appendIndex(h1ByKey, key, heading.path)
  appendIndex(isArchivePath(heading.path) ? archiveH1ByKey : activeH1ByKey, key, heading.path)
}

const appendIndex = (index: Map<string, Chunk.Chunk<string>>, key: string, path: string): void => {
  index.set(key, Chunk.append(index.get(key) ?? Chunk.empty<string>(), path))
}

const sortIndex = (index: Map<string, Chunk.Chunk<string>>): ReadonlyMap<string, Chunk.Chunk<string>> => {
  const sorted = new Map<string, Chunk.Chunk<string>>()
  for (const key of Array.from(index.keys()).sort(Str.Order)) {
    sorted.set(
      key,
      Chunk.fromIterable(Array.from(new Set(Chunk.toReadonlyArray(index.get(key) ?? Chunk.empty()))).sort(Str.Order))
    )
  }
  return sorted
}

const sortFindings = (findings: Chunk.Chunk<CheckFinding>): Chunk.Chunk<CheckFinding> =>
  Chunk.fromIterable(Array.from(Chunk.toReadonlyArray(findings)).sort(compareFinding))

const compareFinding = (left: CheckFinding, right: CheckFinding): number =>
  Str.Order(left.path, right.path) ||
  compareOptionalNumber(left.position?.start.line, right.position?.start.line) ||
  Str.Order(left.category, right.category) ||
  Str.Order(left.severity, right.severity) ||
  Str.Order(left.message, right.message)

const compareOptionalNumber = (left: number | undefined, right: number | undefined): number =>
  left === right ? 0 : left === undefined ? 1 : right === undefined ? -1 : left - right


const basename = (path: string): string => {
  const normalized = normalizePath(path)
  const index = normalized.lastIndexOf("/")
  return index < 0 ? normalized : normalized.slice(index + 1)
}

const normalizePath = (path: string): string => {
  const normalized = Str.replaceAll("\\", "/")(path)
  return Str.startsWith("./")(normalized) ? normalized.slice(2) : normalized
}


const uniquePaths = (paths: Chunk.Chunk<string>): Chunk.Chunk<string> => {
  const selected = new Set<string>()
  for (const path of paths) {
    selected.add(normalizePath(path))
  }
  return Chunk.fromIterable(Array.from(selected).sort(Str.Order))
}
