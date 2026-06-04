import { Chunk, Context, Effect, Layer, String as Str } from "effect"
import { CheckContext, CheckFinding } from "./CheckModel"
import { VaultService, type VaultServiceShape } from "./VaultService"
import type { CheckServiceError } from "./CheckService"
import type { VaultHeadingRecord, VaultLinkRecord } from "./Vault"
import * as VaultScope from "./VaultScope"

export type CheckAnalyzer = {
  readonly analyzeFile: (path: string) => Effect.Effect<Chunk.Chunk<CheckFinding>, CheckServiceError, CheckContext>
}

const vaultDiagnostics = Effect.fn("VaultDiagnosticsCheckAnalyzer.analyzeFile")(function* (path: string) {
  const context = yield* CheckContext
  const diagnostics = yield* context.vault.diagnostics(VaultScope.fromPath(path))
  return Chunk.map(
    diagnostics,
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
})

const linkIntegrity = Effect.fn("LinkIntegrityCheckAnalyzer.analyzeFile")(function* (path: string) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()
  const seen = new Set<string>()

  const links = yield* context.vault.links(VaultScope.fromPath(path))
  for (const link of links) {
    const matches = matchingPaths(
      context.indexes.notesByKey,
      context.indexes.basenameByKey,
      context.indexes.h1ByKey,
      link.path,
      link.target
    )
    if (matches.length === 0) {
      const key = linkFindingKey(link, "error")
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "links",
          severity: "error",
          path: link.path,
          message: `Broken link: ${link.original}`,
          position: link.position,
          suggestedFix: `Create note "${link.target}" or update the wikilink target.`,
          triggerPath: link.path
        })
      )
    } else if (matches.length > 1) {
      const key = linkFindingKey(link, "warning")
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "links",
          severity: "warning",
          path: link.path,
          message: `Ambiguous link: ${link.original}`,
          position: link.position,
          suggestedFix: "Use a path-qualified wikilink; preserve the alias with [[path/to/note|alias]] if needed.",
          relatedPaths: Chunk.fromIterable(matches.filter((path) => path !== link.path)),
          triggerPath: link.path
        })
      )
    }
  }

  return findings
})

const duplicateHeadings = Effect.fn("DuplicateHeadingCheckAnalyzer.analyzeFile")(function* (path: string) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  const headings = yield* context.vault.headings(VaultScope.fromPath(path))
  for (const heading of headings) {
    if (heading.depth !== 1 || isArchivePath(heading.path)) {
      continue
    }
    const key = normalizeKey(heading.text)
    const matches = context.indexes.activeH1ByKey.get(key) ?? Chunk.empty<string>()
    const related = sortedOtherPaths(matches, heading.path)
    if (related.length > 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "headings",
          severity: "warning",
          path: heading.path,
          message: `Duplicate active H1: ${heading.text}`,
          position: heading.position,
          suggestedFix: "Rename one top-level heading or move one note out of the active namespace.",
          relatedPaths: Chunk.fromIterable(related),
          triggerPath: heading.path
        })
      )
    }
  }

  return findings
})

const titleDrift = Effect.fn("TitleDriftCheckAnalyzer.analyzeFile")(function* (path: string) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  const fileScope = VaultScope.fromPath(path)
  const notes = yield* context.vault.notes(fileScope)
  const headings = yield* context.vault.headings(fileScope)
  const frontmatter = yield* context.vault.frontmatter(fileScope)
  for (const note of notes) {
    const titleKey = normalizeKey(titleFromPath(note.path))
    const firstH1 = firstDepthOneHeading(headings, note.path)
    const isSourceCopyNote = hasFrontmatterValue(frontmatter, note.path, "type", "source-copy")

    if (firstH1 !== undefined && !isSourceCopyNote && normalizeKey(firstH1.text) !== titleKey) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "title-drift",
          severity: "warning",
          path: firstH1.path,
          message: `H1 does not match note title: ${firstH1.text}`,
          position: firstH1.position,
          suggestedFix: "Update the H1 or frontmatter title to match the note basename.",
          triggerPath: note.path
        })
      )
    }

    for (const record of Chunk.filter(frontmatter, (record) => record.path === note.path)) {
      for (const entry of frontmatterTitles(record.value)) {
        if (normalizeKey(entry.value) !== titleKey) {
          findings = Chunk.append(
            findings,
            new CheckFinding({
              category: "title-drift",
              severity: "warning",
              path: record.path,
              message: `Frontmatter ${entry.key} does not match note title: ${entry.value}`,
              position: record.position,
              suggestedFix: "Update the H1 or frontmatter title to match the note basename.",
              triggerPath: note.path
            })
          )
        }
      }
    }
  }

  return findings
})

const archiveHeadings = Effect.fn("ArchiveHeadingCheckAnalyzer.analyzeFile")(function* (path: string) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  const headings = yield* context.vault.headings(VaultScope.fromPath(path))
  for (const heading of headings) {
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
          position: heading.position,
          suggestedFix: "Rename the archive heading to a unique archived title.",
          relatedPaths: Chunk.fromIterable(related),
          triggerPath: heading.path
        })
      )
    }
  }

  return findings
})

const dumpInbox = (
  vault: VaultServiceShape
): ((path: string) => Effect.Effect<Chunk.Chunk<CheckFinding>, CheckServiceError, CheckContext>) =>
  Effect.fn("DumpInboxCheckAnalyzer.analyzeFile")(function* (path: string) {
    if (basename(path) !== "dump.md") {
      return Chunk.empty<CheckFinding>()
    }
    const contents = yield* vault.readText(path)
    const lineNumber = firstStrandedDumpLine(contents)
    if (lineNumber === undefined) {
      return Chunk.empty<CheckFinding>()
    }
    return Chunk.of(
      new CheckFinding({
        category: "dump",
        severity: "warning",
        path,
        position: positionForLine(lineNumber),
        message: "dump.md contains stranded non-heading content",
        suggestedFix: "Move or archive stranded dump content.",
        triggerPath: path
      })
    )
  })

const taskMetadata = Effect.fn("TaskMetadataCheckAnalyzer.analyzeFile")(function* (path: string) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  const tasks = yield* context.vault.tasks(VaultScope.fromPath(path))
  for (const record of tasks) {
    for (const fieldName of dateFieldNames) {
      const value = record.fields[fieldName]
      if (value !== undefined && !isIsoDate(value)) {
        findings = Chunk.append(
          findings,
          new CheckFinding({
            category: "tasks",
            severity: "error",
            path: record.path,
            position: record.position,
            message: `Invalid ${fieldName} date: ${value}`,
            suggestedFix: "Use a valid YYYY-MM-DD date.",
            triggerPath: record.path
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
          position: record.position,
          message: "Open task is missing [area:: ...] metadata",
          suggestedFix: "Add [area:: [[...]]] metadata.",
          triggerPath: record.path
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
          position: record.position,
          message: "Open task is missing [project:: ...] metadata",
          suggestedFix: "Add [project:: [[...]]] metadata.",
          triggerPath: record.path
        })
      )
    }
  }

  return findings
})

export class VaultDiagnosticsCheckAnalyzer extends Context.Service<VaultDiagnosticsCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/VaultDiagnosticsCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<VaultDiagnosticsCheckAnalyzer> = Layer.succeed(
    VaultDiagnosticsCheckAnalyzer,
    VaultDiagnosticsCheckAnalyzer.of({ analyzeFile: vaultDiagnostics })
  )
}

export class LinkIntegrityCheckAnalyzer extends Context.Service<LinkIntegrityCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/LinkIntegrityCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<LinkIntegrityCheckAnalyzer> = Layer.succeed(
    LinkIntegrityCheckAnalyzer,
    LinkIntegrityCheckAnalyzer.of({ analyzeFile: linkIntegrity })
  )
}

export class DuplicateHeadingCheckAnalyzer extends Context.Service<DuplicateHeadingCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/DuplicateHeadingCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<DuplicateHeadingCheckAnalyzer> = Layer.succeed(
    DuplicateHeadingCheckAnalyzer,
    DuplicateHeadingCheckAnalyzer.of({ analyzeFile: duplicateHeadings })
  )
}

export class TitleDriftCheckAnalyzer extends Context.Service<TitleDriftCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/TitleDriftCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<TitleDriftCheckAnalyzer> = Layer.succeed(
    TitleDriftCheckAnalyzer,
    TitleDriftCheckAnalyzer.of({ analyzeFile: titleDrift })
  )
}

export class ArchiveHeadingCheckAnalyzer extends Context.Service<ArchiveHeadingCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/ArchiveHeadingCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<ArchiveHeadingCheckAnalyzer> = Layer.succeed(
    ArchiveHeadingCheckAnalyzer,
    ArchiveHeadingCheckAnalyzer.of({ analyzeFile: archiveHeadings })
  )
}

export class DumpInboxCheckAnalyzer extends Context.Service<DumpInboxCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/DumpInboxCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<DumpInboxCheckAnalyzer, never, VaultService> = Layer.effect(
    DumpInboxCheckAnalyzer,
    Effect.gen(function* () {
      const vault: VaultServiceShape = yield* VaultService
      return DumpInboxCheckAnalyzer.of({ analyzeFile: dumpInbox(vault) })
    })
  )
}

export class TaskMetadataCheckAnalyzer extends Context.Service<TaskMetadataCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault/TaskMetadataCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<TaskMetadataCheckAnalyzer> = Layer.succeed(
    TaskMetadataCheckAnalyzer,
    TaskMetadataCheckAnalyzer.of({ analyzeFile: taskMetadata })
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
  sourcePath: string,
  target: string
): ReadonlyArray<string> => {
  const paths = matchingGlobalPaths(notesByKey, basenameByKey, h1ByKey, target)
  if (paths.length > 0 || !isRelativePathQualifiedTarget(target)) {
    return paths
  }
  return sortedPaths(notesByKey.get(relativeTargetKey(sourcePath, target)) ?? Chunk.empty<string>())
}

const matchingGlobalPaths = (
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
const linkFindingKey = (link: VaultLinkRecord, severity: "error" | "warning"): string =>
  `${severity}\u0000${link.path}\u0000${link.target}\u0000${link.original}\u0000${sourcePositionKey(link.position)}`

const sourcePositionKey = (position: VaultLinkRecord["position"]): string =>
  position === undefined
    ? ""
    : `${position.start.line}:${position.start.column}:${position.start.offset ?? ""}-${position.end.line}:${position.end.column}:${
        position.end.offset ?? ""
      }`

const relativeTargetKey = (sourcePath: string, target: string): string => {
  const headingIndex = target.indexOf("#")
  const pathTarget = headingIndex < 0 ? target : target.slice(0, headingIndex)
  const heading = headingIndex < 0 ? "" : target.slice(headingIndex)
  const directory = dirname(sourcePath)
  return normalizeKey(`${normalizeRelativePath(directory, pathTarget)}${heading}`)
}

const isRelativePathQualifiedTarget = (target: string): boolean => {
  const pathTarget = target.slice(0, target.indexOf("#") < 0 ? target.length : target.indexOf("#"))
  return pathTarget.includes("/") && !pathTarget.startsWith("/")
}

const dirname = (path: string): string => {
  const normalized = Str.replaceAll("\\", "/")(path)
  const index = normalized.lastIndexOf("/")
  return index < 0 ? "" : normalized.slice(0, index)
}

const normalizeRelativePath = (directory: string, target: string): string => {
  const segments = `${directory.length === 0 ? target : `${directory}/${target}`}`.split("/")
  const normalized: Array<string> = []
  for (const segment of segments) {
    if (segment.length === 0 || segment === ".") {
      continue
    }
    if (segment === "..") {
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }
  return normalized.join("/")
}


const firstDepthOneHeading = (
  headings: Chunk.Chunk<VaultHeadingRecord>,
  path: string
): VaultHeadingRecord | undefined => {
  for (const heading of headings) {
    if (heading.path === path && heading.depth === 1) {
      return heading
    }
  }
  return undefined
}

const frontmatterTitles = (value: string): ReadonlyArray<{ readonly key: string; readonly value: string }> => {
  const entries: Array<{ readonly key: string; readonly value: string }> = []
  const lines = value.split("\n")
  for (const line of lines) {
    const entry = frontmatterEntry(line)
    if (entry === undefined || entry.key !== "title" || entry.value.length === 0) {
      continue
    }
    entries.push(entry)
  }
  return entries
}

const hasFrontmatterValue = (
  records: Chunk.Chunk<{ readonly path: string; readonly value: string }>,
  path: string,
  expectedKey: string,
  expectedValue: string
): boolean => {
  for (const record of records) {
    if (record.path !== path) {
      continue
    }
    const lines = record.value.split("\n")
    for (const line of lines) {
      const entry = frontmatterEntry(line)
      if (entry !== undefined && entry.key === expectedKey && entry.value === expectedValue) {
        return true
      }
    }
  }
  return false
}

const frontmatterEntry = (line: string): { readonly key: string; readonly value: string } | undefined => {
  const trimmed = line.trim()
  const separator = trimmed.indexOf(":")
  if (separator <= 0) {
    return undefined
  }
  const key = trimmed.slice(0, separator).trim().toLowerCase()
  const value = unquote(trimmed.slice(separator + 1).trim())
  return { key, value }
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

const positionForLine = (lineNumber: number) => ({
  start: { line: lineNumber, column: 1, offset: 0 },
  end: { line: lineNumber, column: 1, offset: 0 }
})

const unquote = (value: string): string =>
  (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value

const basename = (path: string): string => {
  const normalized = Str.replaceAll("\\", "/")(path)
  const index = normalized.lastIndexOf("/")
  return index < 0 ? normalized : normalized.slice(index + 1)
}

const titleFromPath = (path: string): string => {
  const name = basename(path)
  return name.endsWith(".md") ? name.slice(0, -3) : name
}

const normalizeKey = (value: string): string => {
  const index = value.indexOf("#")
  const withoutHeading = index < 0 ? value : value.slice(0, index)
  const trimmed = withoutHeading.trim().toLowerCase()
  return trimmed.endsWith(".md") ? trimmed.slice(0, -3) : trimmed
}

const isArchivePath = (path: string): boolean =>
  path.split("/").some((part) => part === "90-Archive" || part === "Archive")
