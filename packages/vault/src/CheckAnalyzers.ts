import { Chunk, Context, Effect, Layer, String as Str } from "effect"
import { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckFile } from "./CheckModel"
import { VaultService, type VaultServiceShape } from "./VaultService"
import type { CheckServiceError } from "./CheckService"

export type CheckAnalyzer = {
  readonly analyze: (file: CheckFile) => Effect.Effect<Chunk.Chunk<CheckFinding>, CheckServiceError, CheckContext>
}

const catalogDiagnostics = Effect.fn("CatalogDiagnosticsCheckAnalyzer.analyze")(function* (file: CheckFile) {
  return Chunk.map(
    file.diagnostics,
    (diagnostic) =>
      new CheckFinding({
        category: "catalog",
        severity: "error",
        path: diagnostic.path,
        message: diagnostic.message,
        triggerPath: file.path
      })
  )
})

const linkIntegrity = Effect.fn("LinkIntegrityCheckAnalyzer.analyze")(function* (file: CheckFile) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  for (const link of file.links) {
    const matches = matchingPaths(
      context.indexes.notesByKey,
      context.indexes.basenameByKey,
      context.indexes.h1ByKey,
      link.target
    )
    if (matches.length === 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "links",
          severity: "error",
          path: link.path,
          message: `Broken link: ${link.original}`,
          triggerPath: file.path
        })
      )
    } else if (matches.length > 1) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "links",
          severity: "warning",
          path: link.path,
          message: `Ambiguous link: ${link.original}`,
          relatedPaths: Chunk.fromIterable(matches.filter((path) => path !== file.path)),
          triggerPath: file.path
        })
      )
    }
  }

  return findings
})

const duplicateHeadings = Effect.fn("DuplicateHeadingCheckAnalyzer.analyze")(function* (file: CheckFile) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  for (const heading of file.headings) {
    if (heading.depth !== 1 || isArchivePath(heading.path)) {
      continue
    }
    const key = normalizeKey(heading.text)
    const matches = context.indexes.activeH1ByKey.get(key) ?? Chunk.empty<string>()
    const related = sortedOtherPaths(matches, file.path)
    if (related.length > 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "headings",
          severity: "warning",
          path: heading.path,
          message: `Duplicate active H1: ${heading.text}`,
          relatedPaths: Chunk.fromIterable(related),
          triggerPath: file.path
        })
      )
    }
  }

  return findings
})

const titleDrift = Effect.fn("TitleDriftCheckAnalyzer.analyze")(function* (file: CheckFile) {
  let findings = Chunk.empty<CheckFinding>()
  const titleKey = normalizeKey(file.note?.title ?? basename(file.path))
  const firstH1 = firstDepthOneHeading(file)

  if (firstH1 !== undefined && normalizeKey(firstH1.text) !== titleKey) {
    findings = Chunk.append(
      findings,
      new CheckFinding({
        category: "title-drift",
        severity: "warning",
        path: firstH1.path,
        message: `H1 does not match note title: ${firstH1.text}`,
        triggerPath: file.path
      })
    )
  }

  for (const record of file.frontmatter) {
    for (const entry of frontmatterTitles(record.value)) {
      if (normalizeKey(entry.value) !== titleKey) {
        findings = Chunk.append(
          findings,
          new CheckFinding({
            category: "title-drift",
            severity: "warning",
            path: record.path,
            message: `Frontmatter ${entry.key} does not match note title: ${entry.value}`,
            triggerPath: file.path
          })
        )
      }
    }
  }

  return findings
})

const archiveHeadings = Effect.fn("ArchiveHeadingCheckAnalyzer.analyze")(function* (file: CheckFile) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  for (const heading of file.headings) {
    if (heading.depth !== 1) {
      continue
    }
    const key = normalizeKey(heading.text)
    const related = isArchivePath(heading.path)
      ? sortedPaths(context.indexes.activeH1ByKey.get(key) ?? Chunk.empty<string>())
      : sortedPaths(context.indexes.archiveH1ByKey.get(key) ?? Chunk.empty<string>())
    if (related.length > 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "archive-headings",
          severity: "error",
          path: heading.path,
          message: `Archive H1 collision: ${heading.text}`,
          relatedPaths: Chunk.fromIterable(related),
          triggerPath: file.path
        })
      )
    }
  }

  return findings
})

const dumpInbox: (
  vault: VaultServiceShape,
  file: CheckFile
) => Effect.Effect<Chunk.Chunk<CheckFinding>, CheckServiceError> = Effect.fn("DumpInboxCheckAnalyzer.analyze")(
  function* (vault: VaultServiceShape, file: CheckFile) {
    if (basename(file.path) !== "dump.md") {
      return Chunk.empty<CheckFinding>()
    }

    const contents = yield* vault.readText(file.path)
    const lineNumber = firstStrandedDumpLine(contents)
    if (lineNumber === undefined) {
      return Chunk.empty<CheckFinding>()
    }

    return Chunk.of(
      new CheckFinding({
        category: "dump",
        severity: "warning",
        path: file.path,
        lineNumber,
        message: "dump.md contains stranded non-heading content",
        triggerPath: file.path
      })
    )
  }
)

const taskMetadata = Effect.fn("TaskMetadataCheckAnalyzer.analyze")(function* (file: CheckFile) {
  let findings = Chunk.empty<CheckFinding>()

  for (const record of file.tasks) {
    for (const fieldName of dateFieldNames) {
      const value = record.fields[fieldName]
      if (value !== undefined && !isIsoDate(value)) {
        findings = Chunk.append(
          findings,
          new CheckFinding({
            category: "tasks",
            severity: "error",
            path: record.path,
            lineNumber: record.lineNumber,
            message: `Invalid ${fieldName} date: ${value}`,
            triggerPath: file.path
          })
        )
      }
    }

    if (record.done) {
      continue
    }

    if (record.task.area === undefined || record.task.area.length === 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "tasks",
          severity: "error",
          path: record.path,
          lineNumber: record.lineNumber,
          message: "Open task is missing [area:: ...] metadata",
          triggerPath: file.path
        })
      )
    }

    if (record.task.project === undefined || record.task.project.length === 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "tasks",
          severity: "error",
          path: record.path,
          lineNumber: record.lineNumber,
          message: "Open task is missing [project:: ...] metadata",
          triggerPath: file.path
        })
      )
    }
  }

  return findings
})
export class CatalogDiagnosticsCheckAnalyzer extends Context.Service<CatalogDiagnosticsCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/CatalogDiagnosticsCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<CatalogDiagnosticsCheckAnalyzer> = Layer.succeed(
    CatalogDiagnosticsCheckAnalyzer,
    CatalogDiagnosticsCheckAnalyzer.of({ analyze: catalogDiagnostics })
  )
}

export class LinkIntegrityCheckAnalyzer extends Context.Service<LinkIntegrityCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/LinkIntegrityCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<LinkIntegrityCheckAnalyzer> = Layer.succeed(
    LinkIntegrityCheckAnalyzer,
    LinkIntegrityCheckAnalyzer.of({ analyze: linkIntegrity })
  )
}

export class DuplicateHeadingCheckAnalyzer extends Context.Service<DuplicateHeadingCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/DuplicateHeadingCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<DuplicateHeadingCheckAnalyzer> = Layer.succeed(
    DuplicateHeadingCheckAnalyzer,
    DuplicateHeadingCheckAnalyzer.of({ analyze: duplicateHeadings })
  )
}

export class TitleDriftCheckAnalyzer extends Context.Service<TitleDriftCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/TitleDriftCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<TitleDriftCheckAnalyzer> = Layer.succeed(
    TitleDriftCheckAnalyzer,
    TitleDriftCheckAnalyzer.of({ analyze: titleDrift })
  )
}

export class ArchiveHeadingCheckAnalyzer extends Context.Service<ArchiveHeadingCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/ArchiveHeadingCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<ArchiveHeadingCheckAnalyzer> = Layer.succeed(
    ArchiveHeadingCheckAnalyzer,
    ArchiveHeadingCheckAnalyzer.of({ analyze: archiveHeadings })
  )
}

export class DumpInboxCheckAnalyzer extends Context.Service<DumpInboxCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/DumpInboxCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<DumpInboxCheckAnalyzer, never, VaultService> = Layer.effect(
    DumpInboxCheckAnalyzer,
    Effect.gen(function* () {
      const vault: VaultServiceShape = yield* VaultService
      const analyze: CheckAnalyzer["analyze"] = (file) => dumpInbox(vault, file)
      return DumpInboxCheckAnalyzer.of({ analyze })
    })
  )
}

export class TaskMetadataCheckAnalyzer extends Context.Service<TaskMetadataCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/TaskMetadataCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<TaskMetadataCheckAnalyzer> = Layer.succeed(
    TaskMetadataCheckAnalyzer,
    TaskMetadataCheckAnalyzer.of({ analyze: taskMetadata })
  )
}

const dateFieldNames = ["scheduled", "due", "completed"] as const

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

const daysInMonth = (year: number, month: number): number => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

const isLeapYear = (year: number): boolean => year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)

const matchingPaths = (
  notesByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  basenameByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  h1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  target: string
): ReadonlyArray<string> => {
  const key = normalizeKey(target)
  const paths = new Set<string>()
  appendPaths(paths, notesByKey.get(key))
  appendPaths(paths, basenameByKey.get(key))
  appendPaths(paths, h1ByKey.get(key))
  return Array.from(paths).sort(compareString)
}

const appendPaths = (paths: Set<string>, values: Chunk.Chunk<string> | undefined): void => {
  if (values === undefined) {
    return
  }
  for (const path of values) {
    paths.add(path)
  }
}

const sortedOtherPaths = (paths: Chunk.Chunk<string>, triggerPath: string): ReadonlyArray<string> =>
  sortedPaths(paths).filter((path) => path !== triggerPath)

const sortedPaths = (paths: Chunk.Chunk<string>): ReadonlyArray<string> =>
  Array.from(new Set(Chunk.toReadonlyArray(paths))).sort(compareString)

const compareString = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

const firstDepthOneHeading = (file: CheckFile) => {
  for (const heading of file.headings) {
    if (heading.depth === 1) {
      return heading
    }
  }
  return undefined
}

const frontmatterTitles = (value: string): ReadonlyArray<{ readonly key: string; readonly value: string }> => {
  const entries: Array<{ readonly key: string; readonly value: string }> = []
  const lines = value.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    const separator = trimmed.indexOf(":")
    if (separator <= 0) {
      continue
    }
    const key = trimmed.slice(0, separator).trim().toLowerCase()
    if (key !== "title" && key !== "topic") {
      continue
    }
    const rawValue = trimmed.slice(separator + 1).trim()
    const value = unquote(rawValue)
    if (value.length > 0) {
      entries.push({ key, value })
    }
  }
  return entries
}

const firstStrandedDumpLine = (contents: string): number | undefined => {
  const lines = contents.split("\n")
  for (let index = 0; index < lines.length; index++) {
    const trimmed = (lines[index] ?? "").trim()
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      return index + 1
    }
  }
  return undefined
}

const unquote = (value: string): string =>
  (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value

const basename = (path: string): string => {
  const normalized = Str.replaceAll("\\", "/")(path)
  const index = normalized.lastIndexOf("/")
  return index < 0 ? normalized : normalized.slice(index + 1)
}

const normalizeKey = (value: string): string => {
  const index = value.indexOf("#")
  const withoutHeading = index < 0 ? value : value.slice(0, index)
  const trimmed = withoutHeading.trim().toLowerCase()
  return trimmed.endsWith(".md") ? trimmed.slice(0, -3) : trimmed
}

const isArchivePath = (path: string): boolean =>
  path.split("/").some((part) => part === "90-Archive" || part === "Archive")
