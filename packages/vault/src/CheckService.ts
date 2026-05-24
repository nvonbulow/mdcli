import { Chunk, Context, Effect, Layer, String as Str } from "effect"
import type * as Glob from "./Glob"
import {
  ArchiveHeadingCheckAnalyzer,
  CatalogDiagnosticsCheckAnalyzer,
  DumpInboxCheckAnalyzer,
  DuplicateHeadingCheckAnalyzer,
  LinkIntegrityCheckAnalyzer,
  TaskMetadataCheckAnalyzer,
  TitleDriftCheckAnalyzer
} from "./CheckAnalyzers"
import type { CheckAnalyzer } from "./CheckAnalyzers"
import type { CatalogSnapshot } from "./CatalogModel"
import { CatalogService } from "./CatalogService"
import { CheckContext, CheckFinding, CheckReport } from "./CheckModel"
import type { CheckContextShape, CheckFile, CheckIndexes } from "./CheckModel"
import { VaultService } from "./VaultService"
import type { VaultIoError } from "./VaultErrors"
import type { VaultScope } from "./VaultScope"

export type CheckServiceError = VaultIoError | Glob.GlobError
const serviceRegistry = new WeakMap<
  CheckServiceShape,
  { readonly snapshotForScope: SnapshotForScope; readonly analyzers: ReadonlyArray<CheckAnalyzer> }
>()

export type CheckServiceShape = {
  readonly run: (scope: VaultScope) => Effect.Effect<CheckReport, CheckServiceError>
  readonly runFile: (scope: VaultScope, path: string) => Effect.Effect<CheckReport, CheckServiceError>
  readonly runFiles: (scope: VaultScope, paths: Chunk.Chunk<string>) => Effect.Effect<CheckReport, CheckServiceError>
}
type SnapshotForScope = (scope: VaultScope) => Effect.Effect<CatalogSnapshot, CheckServiceError>

export class CheckService extends Context.Service<CheckService, CheckServiceShape>()("@kb/vault/CheckService") {
  static readonly layerNoDeps: Layer.Layer<CheckService, never, CatalogService | VaultService> = Layer.effect(
    CheckService,
    Effect.gen(function* () {
      const catalog = yield* CatalogService
      const catalogDiagnostics = yield* CatalogDiagnosticsCheckAnalyzer
      const linkIntegrity = yield* LinkIntegrityCheckAnalyzer
      const duplicateHeading = yield* DuplicateHeadingCheckAnalyzer
      const titleDrift = yield* TitleDriftCheckAnalyzer
      const archiveHeading = yield* ArchiveHeadingCheckAnalyzer
      const dumpInbox = yield* DumpInboxCheckAnalyzer
      const taskMetadata = yield* TaskMetadataCheckAnalyzer
      return makeWithSnapshot(
        catalog.snapshot,
        catalogDiagnostics,
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
        CatalogDiagnosticsCheckAnalyzer.layer,
        LinkIntegrityCheckAnalyzer.layer,
        DuplicateHeadingCheckAnalyzer.layer,
        TitleDriftCheckAnalyzer.layer,
        ArchiveHeadingCheckAnalyzer.layer,
        DumpInboxCheckAnalyzer.layer,
        TaskMetadataCheckAnalyzer.layer
      )
    )
  )

  static readonly layer: Layer.Layer<CheckService, never, CatalogService | VaultService> = CheckService.layerNoDeps
}

export const make = (...analyzers: ReadonlyArray<CheckAnalyzer>): CheckServiceShape =>
  makeWithSnapshot(
    (scope) =>
      Effect.gen(function* () {
        const catalog = yield* CatalogService
        return yield* catalog.snapshot(scope)
      }) as Effect.Effect<CatalogSnapshot, CheckServiceError>,
    ...analyzers
  )

const makeWithSnapshot = (
  snapshotForScope: SnapshotForScope,
  ...analyzers: ReadonlyArray<CheckAnalyzer>
): CheckServiceShape => {
  const runSelected = Effect.fn("CheckService.runSelected")(function* (
    scope: VaultScope,
    selected: (file: CheckFile) => boolean
  ) {
    const snapshot = yield* snapshotForScope(scope)
    const context = checkContext(scope, snapshot)
    const selectedFiles = sortFiles(Chunk.filter(context.files, selected))
    const findings = yield* Effect.forEach(selectedFiles, (file) =>
      Effect.forEach(analyzers, (analyzer) => analyzer.analyze(file)).pipe(
        Effect.map((chunks) => Chunk.flatten(Chunk.fromIterable(chunks)))
      )
    ).pipe(
      Effect.map((chunks) => Chunk.flatten(Chunk.fromIterable(chunks))),
      Effect.provideService(CheckContext, context)
    )

    return new CheckReport({ scope, findings: sortFindings(findings) })
  })

  const service = CheckService.of({
    run: (scope) => runSelected(scope, () => true),
    runFile: (scope, path) => {
      const normalizedPath = normalizePath(path)
      return runSelected(scope, (file) => file.path === normalizedPath)
    },
    runFiles: (scope, paths) => {
      const selectedPaths = new Set(Chunk.toReadonlyArray(Chunk.map(paths, normalizePath)))
      return runSelected(scope, (file) => selectedPaths.has(file.path))
    }
  })
  serviceRegistry.set(service, { snapshotForScope, analyzers })
  return service
}

export const addCheck =
  (checkImplementation: CheckAnalyzer) =>
  (self: CheckServiceShape): CheckServiceShape => {
    const registered = serviceRegistry.get(self)
    return registered === undefined
      ? make(checkImplementation)
      : makeWithSnapshot(registered.snapshotForScope, ...registered.analyzers, checkImplementation)
  }

export const all = (
  catalogDiagnostics: CheckAnalyzer,
  linkIntegrity: CheckAnalyzer,
  duplicateHeading: CheckAnalyzer,
  titleDrift: CheckAnalyzer,
  archiveHeading: CheckAnalyzer,
  dumpInbox: CheckAnalyzer,
  taskMetadata: CheckAnalyzer
): CheckServiceShape =>
  make(catalogDiagnostics, linkIntegrity, duplicateHeading, titleDrift, archiveHeading, dumpInbox, taskMetadata)

export const linksOnly = (linkIntegrity: CheckAnalyzer): CheckServiceShape => make(linkIntegrity)

export const headingsBundle = (
  duplicateHeading: CheckAnalyzer,
  titleDrift: CheckAnalyzer,
  archiveHeading: CheckAnalyzer
): CheckServiceShape => make(duplicateHeading, titleDrift, archiveHeading)

export const tasksOnly = (taskMetadata: CheckAnalyzer): CheckServiceShape => make(taskMetadata)

export const dumpOnly = (dumpInbox: CheckAnalyzer): CheckServiceShape => make(dumpInbox)

export const layerAll: Layer.Layer<CheckService, never, CatalogService | VaultService> = CheckService.layer

export const layerLinksOnly: Layer.Layer<CheckService, never, CatalogService> = Layer.effect(
  CheckService,
  Effect.gen(function* () {
    const catalog = yield* CatalogService
    const linkIntegrity = yield* LinkIntegrityCheckAnalyzer
    return makeWithSnapshot(catalog.snapshot, linkIntegrity)
  })
).pipe(Layer.provide(LinkIntegrityCheckAnalyzer.layer))

export const layerHeadingsBundle: Layer.Layer<CheckService, never, CatalogService> = Layer.effect(
  CheckService,
  Effect.gen(function* () {
    const catalog = yield* CatalogService
    const duplicateHeading = yield* DuplicateHeadingCheckAnalyzer
    const titleDrift = yield* TitleDriftCheckAnalyzer
    const archiveHeading = yield* ArchiveHeadingCheckAnalyzer
    return makeWithSnapshot(catalog.snapshot, duplicateHeading, titleDrift, archiveHeading)
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

export const layerTasksOnly: Layer.Layer<CheckService, never, CatalogService> = Layer.effect(
  CheckService,
  Effect.gen(function* () {
    const catalog = yield* CatalogService
    const taskMetadata = yield* TaskMetadataCheckAnalyzer
    return makeWithSnapshot(catalog.snapshot, taskMetadata)
  })
).pipe(Layer.provide(TaskMetadataCheckAnalyzer.layer))

export const layerDumpOnly: Layer.Layer<CheckService, never, CatalogService | VaultService> = Layer.effect(
  CheckService,
  Effect.gen(function* () {
    const catalog = yield* CatalogService
    const dumpInbox = yield* DumpInboxCheckAnalyzer
    return makeWithSnapshot(catalog.snapshot, dumpInbox)
  })
).pipe(Layer.provide(DumpInboxCheckAnalyzer.layer))

const checkContext = (scope: VaultScope, snapshot: CatalogSnapshot): CheckContextShape =>
  CheckContext.of({
    scope,
    snapshot,
    files: filesFromSnapshot(snapshot),
    indexes: indexesFromSnapshot(snapshot)
  })

const filesFromSnapshot = (snapshot: CatalogSnapshot): Chunk.Chunk<CheckFile> => {
  const noteFiles = Chunk.map(snapshot.notes, (note) => ({
    path: note.path,
    note,
    frontmatter: note.frontmatter,
    headings: note.headings,
    links: note.links,
    tags: note.tags,
    listItems: note.listItems,
    tasks: note.tasks,
    fencedBlocks: note.fencedBlocks,
    diagnostics: Chunk.filter(snapshot.diagnostics, (diagnostic) => diagnostic.path === note.path)
  }))

  const notePaths = new Set(Chunk.toReadonlyArray(Chunk.map(snapshot.notes, (note) => note.path)))
  const diagnosticFiles = Chunk.map(
    Chunk.filter(snapshot.diagnostics, (diagnostic) => !notePaths.has(diagnostic.path)),
    (diagnostic) => ({
      path: diagnostic.path,
      frontmatter: Chunk.empty(),
      headings: Chunk.empty(),
      links: Chunk.empty(),
      tags: Chunk.empty(),
      listItems: Chunk.empty(),
      tasks: Chunk.empty(),
      fencedBlocks: Chunk.empty(),
      diagnostics: Chunk.of(diagnostic)
    })
  )

  return Chunk.appendAll(noteFiles, diagnosticFiles)
}

const indexesFromSnapshot = (snapshot: CatalogSnapshot): CheckIndexes => {
  const notesByKey = new Map<string, Chunk.Chunk<string>>()
  const basenameByKey = new Map<string, Chunk.Chunk<string>>()
  const h1ByKey = new Map<string, Chunk.Chunk<string>>()
  const activeH1ByKey = new Map<string, Chunk.Chunk<string>>()
  const archiveH1ByKey = new Map<string, Chunk.Chunk<string>>()

  for (const note of snapshot.notes) {
    appendIndex(notesByKey, normalizeKey(note.path), note.path)
    appendIndex(basenameByKey, normalizeKey(basename(note.path)), note.path)
  }

  for (const heading of snapshot.headings) {
    if (heading.depth !== 1) {
      continue
    }
    const key = normalizeKey(heading.text)
    appendIndex(h1ByKey, key, heading.path)
    appendIndex(isArchivePath(heading.path) ? archiveH1ByKey : activeH1ByKey, key, heading.path)
  }

  return {
    notesByKey: sortIndex(notesByKey),
    basenameByKey: sortIndex(basenameByKey),
    h1ByKey: sortIndex(h1ByKey),
    activeH1ByKey: sortIndex(activeH1ByKey),
    archiveH1ByKey: sortIndex(archiveH1ByKey)
  }
}

const appendIndex = (index: Map<string, Chunk.Chunk<string>>, key: string, path: string): void => {
  index.set(key, Chunk.append(index.get(key) ?? Chunk.empty<string>(), path))
}

const sortIndex = (index: Map<string, Chunk.Chunk<string>>): ReadonlyMap<string, Chunk.Chunk<string>> => {
  const sorted = new Map<string, Chunk.Chunk<string>>()
  for (const key of Array.from(index.keys()).sort(compareString)) {
    sorted.set(
      key,
      Chunk.fromIterable(
        Array.from(new Set(Chunk.toReadonlyArray(index.get(key) ?? Chunk.empty()))).sort(compareString)
      )
    )
  }
  return sorted
}
const sortFiles = (files: Chunk.Chunk<CheckFile>): Chunk.Chunk<CheckFile> =>
  Chunk.fromIterable(
    Array.from(Chunk.toReadonlyArray(files)).sort((left, right) => compareString(left.path, right.path))
  )

const sortFindings = (findings: Chunk.Chunk<CheckFinding>): Chunk.Chunk<CheckFinding> =>
  Chunk.fromIterable(Array.from(Chunk.toReadonlyArray(findings)).sort(compareFinding))

const compareFinding = (left: CheckFinding, right: CheckFinding): number =>
  compareString(left.path, right.path) ||
  compareOptionalNumber(left.lineNumber, right.lineNumber) ||
  compareString(left.category, right.category) ||
  compareString(left.severity, right.severity) ||
  compareString(left.message, right.message)

const compareOptionalNumber = (left: number | undefined, right: number | undefined): number =>
  left === right ? 0 : left === undefined ? 1 : right === undefined ? -1 : left - right

const compareString = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

const basename = (path: string): string => {
  const normalized = normalizePath(path)
  const index = normalized.lastIndexOf("/")
  return index < 0 ? normalized : normalized.slice(index + 1)
}

const normalizePath = (path: string): string => Str.replaceAll("\\", "/")(path)

const normalizeKey = (value: string): string => {
  const index = value.indexOf("#")
  const withoutHeading = index < 0 ? value : value.slice(0, index)
  const trimmed = withoutHeading.trim().toLowerCase()
  return trimmed.endsWith(".md") ? trimmed.slice(0, -3) : trimmed
}

const isArchivePath = (path: string): boolean =>
  path.split("/").some((part) => part === "90-Archive" || part === "Archive")
