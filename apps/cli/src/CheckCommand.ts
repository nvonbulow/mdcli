import { CheckModel, CheckService, layerDumpOnly, layerHeadingsBundle, layerLinksOnly, layerTasksOnly } from "@kb/vault"
import { Chunk, Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { KbRoot } from "./RootCommand"
import {
  scopeFlags,
  selectedFilesFromFlags,
  vaultScopeFromFlags,
  type OutputFormat,
  type ScopeFlags
} from "./OutputFormat"

const strictFlag = Flag.boolean("strict").pipe(
  Flag.withDescription("Treat warnings as failures"),
  Flag.withDefault(false)
)

type CheckFlags = ScopeFlags & {
  readonly strict: boolean
}

const CheckRoot = Command.make("check").pipe(
  Command.withSharedFlags({
    ...scopeFlags,
    strict: strictFlag
  }),
  Command.withHandler(
    Effect.fn(function* (flags) {
      yield* runCheckWithFlags("all", flags)
    })
  ),
  Command.withDescription("Run vault catalog checks")
)

export const CheckCommand = CheckRoot.pipe(
  Command.withSubcommands([
    Command.make(
      "links",
      {},
      Effect.fn(function* () {
        const flags = yield* CheckRoot
        yield* runCheckWithFlags("links", flags)
      })
    ).pipe(Command.withDescription("Check wikilinks and markdown links"), Command.provide(layerLinksOnly)),

    Command.make(
      "headings",
      {},
      Effect.fn(function* () {
        const flags = yield* CheckRoot
        yield* runCheckWithFlags("headings", flags)
      })
    ).pipe(
      Command.withDescription("Check duplicate, drifted, and archive headings"),
      Command.provide(layerHeadingsBundle)
    ),

    Command.make(
      "tasks",
      {},
      Effect.fn(function* () {
        const flags = yield* CheckRoot
        yield* runCheckWithFlags("tasks", flags)
      })
    ).pipe(Command.withDescription("Check task metadata invariants"), Command.provide(layerTasksOnly)),

    Command.make(
      "dump",
      {},
      Effect.fn(function* () {
        const flags = yield* CheckRoot
        yield* runCheckWithFlags("dump", flags)
      })
    ).pipe(Command.withDescription("Check dump inbox hygiene"), Command.provide(layerDumpOnly))
  ])
)

const runCheckWithFlags = Effect.fn("CheckCommand.runCheckWithFlags")(function* (
  label: string,
  checkFlags: CheckFlags
) {
  const rootFlags = yield* KbRoot
  const checker = yield* CheckService
  const scope = vaultScopeFromFlags(checkFlags)
  const selectedFiles = selectedFilesFromFlags(checkFlags)
  const report = Chunk.isEmpty(selectedFiles)
    ? yield* checker.run(scope)
    : yield* checker.runFiles(scope, selectedFiles)
  const findings = Chunk.toReadonlyArray(report.findings)
  const output = renderReport(rootFlags.format, label, findings)
  yield* Console.log(output)

  const shouldFail = findings.some(
    (finding) => finding.severity === "error" || (checkFlags.strict && finding.severity === "warning")
  )
  if (shouldFail) {
    const errorCount = findings.filter((finding) => finding.severity === "error").length
    const warningCount = findings.filter((finding) => finding.severity === "warning").length
    return yield* Effect.fail(new Error(`Check failed with ${errorCount} error(s) and ${warningCount} warning(s)`))
  }
})

const renderReport = (
  format: OutputFormat,
  label: string,
  findings: ReadonlyArray<CheckModel.CheckFinding>
): string => {
  switch (format) {
    case "pretty":
      return renderPretty(label, findings)
    case "markdown":
      return renderMarkdown(label, findings)
    case "json":
      return renderJson(label, findings)
  }
}

const renderPretty = (label: string, findings: ReadonlyArray<CheckModel.CheckFinding>): string =>
  findings.length === 0
    ? `Checked ${label}: OK`
    : findings
        .map((finding) => `${finding.severity} ${finding.category} ${location(finding)} ${finding.message}`)
        .join("\n")

const renderMarkdown = (label: string, findings: ReadonlyArray<CheckModel.CheckFinding>): string => {
  if (findings.length === 0) {
    return `Checked ${label}: OK.`
  }

  return categories(findings)
    .map((category) => {
      const items = findings
        .filter((finding) => finding.category === category)
        .map((finding) => `- **${finding.severity}** ${location(finding)} ${finding.message}`)
        .join("\n")
      return `### ${category}\n${items}`
    })
    .join("\n\n")
}

const renderJson = (label: string, findings: ReadonlyArray<CheckModel.CheckFinding>): string =>
  JSON.stringify({
    ok: findings.length === 0,
    check: label,
    findings: findings.map(jsonFinding)
  })

const jsonFinding = (finding: CheckModel.CheckFinding): Readonly<Record<string, unknown>> => ({
  severity: finding.severity,
  category: finding.category,
  path: finding.path,
  lineNumber: finding.lineNumber ?? null,
  message: finding.message,
  suggestedFix: finding.suggestedFix ?? null,
  relatedPaths: finding.relatedPaths === undefined ? [] : Chunk.toReadonlyArray(finding.relatedPaths),
  triggerPath: finding.triggerPath ?? null
})

const categories = (findings: ReadonlyArray<CheckModel.CheckFinding>): ReadonlyArray<CheckModel.CheckCategory> =>
  Array.from(new Set(findings.map((finding) => finding.category)))

const location = (finding: CheckModel.CheckFinding): string =>
  finding.lineNumber === undefined ? finding.path : `${finding.path}:${finding.lineNumber}`
