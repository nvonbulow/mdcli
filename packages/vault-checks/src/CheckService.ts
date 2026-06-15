import type { MarkdownStringifyError } from "@kb/markdown-ast"
import { Chunk, Context, Effect, Layer, Result, String as Str, Trie } from "effect"
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
import {
  diagnostics,
  headings,
  notes,
  MarkdownModel,
  VaultService,
  type VaultHeadingRecord,
  type VaultIoError,
  type Vault,
  type VaultScope
} from "@kb/vault-core"
import { TaskRecurrenceService, taskRecordsForVaultNoDeps } from "@kb/vault-tasks"
import type * as VaultCore from "@kb/vault-core"
import { isArchivePath, normalizeKey } from "./CheckAnalyzerUtils"
import { CheckContext, CheckFinding, CheckReport } from "./CheckModel"
import type { CheckIndexes } from "./CheckModel"

export type CheckServiceError = VaultIoError | VaultCore.Glob.GlobError | MarkdownStringifyError
const serviceRegistry = new WeakMap<
  CheckService,
  { readonly scopedVaultForScope: ScopedVaultForScope; readonly analyzers: ReadonlyArray<CheckAnalyzer> }
>()

export interface CheckService {
  readonly run: (scope: VaultScope) => Effect.Effect<CheckReport, CheckServiceError>
  readonly runFile: (scope: VaultScope, path: string) => Effect.Effect<CheckReport, CheckServiceError>
  readonly runFiles: (scope: VaultScope, paths: Chunk.Chunk<string>) => Effect.Effect<CheckReport, CheckServiceError>
}
type ScopedVaultForScope = (scope: VaultScope) => Effect.Effect<Vault, CheckServiceError>

type MarkdownFile = MarkdownModel.MarkdownFile

export class CheckService extends Context.Service<CheckService, CheckService>()("@kb/vault-checks/CheckService") {
  static readonly layerNoDeps: Layer.Layer<CheckService, never, VaultService | TaskRecurrenceService> = Layer.effect(
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

  static readonly layer: Layer.Layer<CheckService, never, VaultService | TaskRecurrenceService> = CheckService.layerNoDeps
}

export const make = (...analyzers: ReadonlyArray<CheckAnalyzer>): CheckService =>
  makeWithScopedVault(
    (scope) =>
      Effect.gen(function* () {
        const vault = yield* VaultService
        return yield* vault.scoped(scope)
      }) as Effect.Effect<Vault, CheckServiceError>,
    ...analyzers
  )

const makeWithScopedVault = (
  scopedVaultForScope: ScopedVaultForScope,
  ...analyzers: ReadonlyArray<CheckAnalyzer>
): CheckService => {
  const runScope = Effect.fn("CheckService.runScope")(function* (
    scope: VaultScope,
    selectedPathsForVault: (vault: Vault) => Chunk.Chunk<string>
  ) {
    const vault = yield* scopedVaultForScope(scope)
    const selectedPaths = uniquePaths(selectedPathsForVault(vault))
    const selected = new Set(Chunk.toReadonlyArray(selectedPaths))
    const context = yield* checkContext(scope, vault, (path) => selected.has(normalizePath(path)))
    const selectedFiles = selectedFilesFromVault(vault, selected)
    const parseFindings = diagnosticFindingsFromVault(vault, selected)
    const analyzerFindings = yield* Effect.forEach(selectedFiles, (file) =>
      Effect.forEach(analyzers, (analyzer) => analyzer.analyzeFile(file)).pipe(
        Effect.map((chunks) => Chunk.flatten(Chunk.fromIterable(chunks)))
      )
    ).pipe(
      Effect.map((chunks) => Chunk.flatten(Chunk.fromIterable(chunks))),
      Effect.provideService(CheckContext, context)
    )

    return new CheckReport({ scope, vault, findings: sortFindings(Chunk.appendAll(parseFindings, analyzerFindings)) })
  })

  const service = CheckService.of({
    run: (scope: VaultScope) => runScope(scope, selectedPathsFromVault),
    runFile: (scope: VaultScope, path: string) => runScope(scope, () => uniquePaths(Chunk.of(normalizePath(path)))),
    runFiles: (scope: VaultScope, paths: Chunk.Chunk<string>) => runScope(scope, () => uniquePaths(Chunk.map(paths, normalizePath)))
  } as unknown as CheckService)
  serviceRegistry.set(service, { scopedVaultForScope, analyzers })
  return service
}

export const addCheck =
  (checkImplementation: CheckAnalyzer) =>
  (self: CheckService): CheckService => {
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
): CheckService =>
  make(vaultDiagnostics, linkIntegrity, duplicateHeading, titleDrift, archiveHeading, dumpInbox, taskMetadata)

export const linksOnly = (linkIntegrity: CheckAnalyzer): CheckService => make(linkIntegrity)

export const headingsBundle = (
  duplicateHeading: CheckAnalyzer,
  titleDrift: CheckAnalyzer,
  archiveHeading: CheckAnalyzer
): CheckService => make(duplicateHeading, titleDrift, archiveHeading)

export const tasksOnly = (taskMetadata: CheckAnalyzer): CheckService => make(taskMetadata)

export const dumpOnly = (dumpInbox: CheckAnalyzer): CheckService => make(dumpInbox)

export const layerAll: Layer.Layer<CheckService, never, VaultService | TaskRecurrenceService> = CheckService.layer

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

export const layerTasksOnly: Layer.Layer<CheckService, never, VaultService | TaskRecurrenceService> = Layer.effect(
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

const selectedPathsFromVault = (vault: Vault): Chunk.Chunk<string> =>
  uniquePaths(
    Chunk.appendAll(
      Chunk.map(notes(vault), (note) => normalizePath(note.path)),
      Chunk.map(diagnostics(vault), (diagnostic) => normalizePath(diagnostic.path))
    )
  )

const selectedFilesFromVault = (vault: Vault, selected: ReadonlySet<string>): Chunk.Chunk<MarkdownFile> => {
  let files = Chunk.empty<MarkdownFile>()
  for (const [path, result] of Trie.entries(vault.files)) {
    if (selected.has(normalizePath(path)) && Result.isSuccess(result)) {
      files = Chunk.append(files, markdownFileAtPath(path, result.success))
    }
  }
  return files
}

const diagnosticFindingsFromVault = (vault: Vault, selected: ReadonlySet<string>): Chunk.Chunk<CheckFinding> =>
  Chunk.map(
    Chunk.filter(diagnostics(vault), (diagnostic) => selected.has(normalizePath(diagnostic.path))),
    (diagnostic) =>
      new CheckFinding({
        category: "catalog",
        severity: "error",
        path: diagnostic.path,
        message: diagnostic.message,
        suggestedFix: "Fix the markdown parse error or remove the unreadable file.",
        triggerPath: diagnostic.path
      })
  )

const checkContext = (
  scope: VaultScope,
  vault: Vault,
  selected: (path: string) => boolean
): Effect.Effect<CheckContext, MarkdownStringifyError> =>
  Effect.gen(function* () {
    const taskRecords = yield* taskRecordsForVaultNoDeps(vault)
    return CheckContext.of({
      scope,
      vault,
      selected,
      indexes: indexesFromVault(vault),
      taskRecords
    } as unknown as CheckContext)
  })

const indexesFromVault = (vault: Vault): CheckIndexes => {
  const noteRecords = notes(vault)
  const headingRecords = headings(vault)
  const notesByKey = new Map<string, Chunk.Chunk<string>>()
  const basenameByKey = new Map<string, Chunk.Chunk<string>>()
  const h1ByKey = new Map<string, Chunk.Chunk<string>>()
  const activeH1ByKey = new Map<string, Chunk.Chunk<string>>()
  const archiveH1ByKey = new Map<string, Chunk.Chunk<string>>()

  for (const note of noteRecords) {
    appendIndex(notesByKey, normalizeKey(note.path), note.path)
    appendIndex(basenameByKey, normalizeKey(basename(note.path)), note.path)
  }

  for (const heading of headingRecords) {
    appendHeadingIndexes(heading, h1ByKey, activeH1ByKey, archiveH1ByKey)
  }

  return {
    notesByKey: sortIndex(notesByKey),
    basenameByKey: sortIndex(basenameByKey),
    h1ByKey: sortIndex(h1ByKey),
    activeH1ByKey: sortIndex(activeH1ByKey),
    archiveH1ByKey: sortIndex(archiveH1ByKey)
  }
}

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

const markdownFileAtPath = (path: string, file: MarkdownFile): MarkdownFile =>
  file.path === path ? file : new MarkdownModel.MarkdownFile({ path, contents: file.contents, mdast: file.mdast })

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
