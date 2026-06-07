import { assert, describe, it } from "@effect/vitest"
import { Chunk, Effect, Layer, Result, Trie } from "effect"

import { CheckModel, CheckService, make } from "@kb/vault-checks"
import { MarkdownModel, MarkdownParser, Vault, VaultService } from "@kb/vault-core"
import * as VaultScope from "@kb/vault-core"
import { MarkdownParseError, MarkdownProcessor } from "@kb/markdown-ast"

const testRoot = "/effect-check-test"

const toArray = <A>(chunk: Chunk.Chunk<A>): ReadonlyArray<A> => Chunk.toReadonlyArray(chunk)

type TestFiles = Record<string, string>

type TestVaultState = {
  readonly files: TestFiles
  readonly parseFailures?: Readonly<Record<string, MarkdownParseError>>
}

type FindingSummary = readonly [
  string,
  string,
  string,
  number | undefined,
  string,
  string | undefined,
  ReadonlyArray<string>
]

const vaultLayer = (state: TestVaultState) =>
  Layer.effect(
    VaultService,
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      const markdownProcessor = yield* MarkdownProcessor

      const readText = (path: string) => Effect.succeed(state.files[absolutePath(path)] ?? "")
      const parseMarkdown = (path: string, contents: string) =>
        parser.parse(contents).pipe(
          Effect.map(
            (file) =>
              new MarkdownModel.MarkdownFile({
                path,
                contents: file.contents,
                mdast: file.mdast
              })
          )
        )
      const readMarkdown = (path: string) => {
        const failure = state.parseFailures?.[path]
        if (failure !== undefined) {
          return Effect.fail(failure)
        }
        return parseMarkdown(path, state.files[absolutePath(path)] ?? "")
      }
      const readMarkdownTree = (scope: VaultScope.VaultScope) =>
        Effect.gen(function* () {
          const ignored = ignoredMarkdownPaths(state.files)
          const paths = relativeMarkdownPaths(state.files).filter((path) => matchesScope(scope, path) && !ignored.has(path))
          const files = yield* Effect.forEach(paths, (path) => {
            const failure = state.parseFailures?.[path]
            if (failure !== undefined) {
              return Effect.succeed([
                path,
                Result.fail(failure) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>
              ] as const)
            }
            return parseMarkdown(path, state.files[absolutePath(path)] ?? "").pipe(
              Effect.match({
                onFailure: (failure) =>
                  [path, Result.fail(failure) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>] as const,
                onSuccess: (file) =>
                  [path, Result.succeed(file) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>] as const
              })
            )
          })
          return {
            root: "",
            files: Trie.fromIterable(files)
          }
        })

      return VaultService.of({
        readText,
        writeText: () => Effect.void,
        readMarkdown,
        readMarkdownTree,
        scoped: (scope) =>
          Effect.flatMap(readMarkdownTree(scope), (tree) =>
            Vault.make({ scope, tree }).pipe(Effect.provideService(MarkdownProcessor, markdownProcessor))
          )
      })
    })
  ).pipe(Layer.provide(Layer.mergeAll(MarkdownParser.layer, MarkdownProcessor.layer)))

const checkLayer = (state: TestVaultState) => CheckService.layer.pipe(Layer.provide(vaultLayer(state)))

const absolutePath = (path: string): string => `${testRoot}/${normalizePath(path)}`

const normalizePath = (path: string): string => (path.startsWith("./") ? path.slice(2) : path)

const relativeMarkdownPaths = (files: TestFiles): ReadonlyArray<string> =>
  Object.keys(files)
    .filter((path) => path.startsWith(`${testRoot}/`) && path.endsWith(".md"))
    .map((path) => path.slice(testRoot.length + 1))
    .sort()

const matchesScope = (scope: VaultScope.VaultScope, path: string): boolean => {
  for (const pattern of toArray(scope.patterns)) {
    if (matchesPattern(pattern, path)) {
      return true
    }
  }
  return false
}

const matchesPattern = (pattern: string, path: string): boolean => {
  const normalizedPattern = normalizePath(pattern)
  if (normalizedPattern === "**/*.md") {
    return path.endsWith(".md")
  }
  if (normalizedPattern.endsWith("/**/*.md")) {
    const prefix = normalizedPattern.slice(0, -"/**/*.md".length)
    return path.startsWith(`${prefix}/`) && path.endsWith(".md")
  }
  return normalizedPattern === path
}

const ignoredMarkdownPaths = (files: TestFiles): ReadonlySet<string> => {
  const ignored = new Set<string>()
  const ignoreFile = files[absolutePath(".kbignore")]
  if (ignoreFile === undefined) {
    return ignored
  }
  for (const line of ignoreFile.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.includes("/")) {
      continue
    }
    for (const path of relativeMarkdownPaths(files)) {
      if (path === trimmed || path.endsWith(`/${trimmed}`)) {
        ignored.add(path)
      }
    }
  }
  return ignored
}

const summaries = (findings: Chunk.Chunk<CheckModel.CheckFinding>): ReadonlyArray<FindingSummary> =>
  toArray(findings).map((finding) => [
    finding.category,
    finding.severity,
    finding.path,
    finding.position?.start.line,
    finding.message,
    finding.triggerPath,
    finding.relatedPaths === undefined ? [] : toArray(finding.relatedPaths)
  ])

const messages = (findings: Chunk.Chunk<CheckModel.CheckFinding>): ReadonlyArray<string> =>
  toArray(findings).map((finding) => finding.message)

describe("CheckService", () => {
  it.effect("reports broken and ambiguous wikilinks resolved from note paths, basenames, and H1s", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath("Notes/Source.md")]: [
          "# Source",
          "See [[Missing]], [[Beta]], [[Shared H1]], [[Notes/Target.md]], [[Unique H1]], and [[sources/incup-full]]."
        ].join("\n"),
        [absolutePath("Notes/Target.md")]: "# Target",
        [absolutePath("Notes/Beta.md")]: "# First Beta",
        [absolutePath("Other/Beta.md")]: "# Second Beta",
        [absolutePath("Notes/ByH1.md")]: "# Unique H1",
        [absolutePath("Notes/SharedA.md")]: "# Shared H1",
        [absolutePath("Other/SharedB.md")]: "# Shared H1",
        [absolutePath("Notes/sources/incup-full.md")]: "# INCUP Full Copy",
      }
    }

    return Effect.gen(function* () {
      const check = yield* CheckService
      const report = yield* check.run(VaultScope.allMarkdown)
      const linkFindings = toArray(report.findings).filter((finding) => finding.category === "links")

      assert.deepStrictEqual(summaries(Chunk.fromIterable(linkFindings)), [
        ["links", "error", "Notes/Source.md", 2, "Broken link: [[Missing]]", "Notes/Source.md", []],
        [
          "links",
          "warning",
          "Notes/Source.md",
          2,
          "Ambiguous link: [[Beta]]",
          "Notes/Source.md",
          ["Notes/Beta.md", "Other/Beta.md"]
        ],
        [
          "links",
          "warning",
          "Notes/Source.md",
          2,
          "Ambiguous link: [[Shared H1]]",
          "Notes/Source.md",
          ["Notes/SharedA.md", "Other/SharedB.md"]
        ]
      ])
    }).pipe(Effect.provide(checkLayer(state)))
  })

  it.effect("reports duplicate active top-level headings and archive heading collisions", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath("30-Projects/A.md")]: "# Active Duplicate",
        [absolutePath("30-Projects/B.md")]: "# Active Duplicate",
        [absolutePath("30-Projects/Live.md")]: "# Archived Topic",
        [absolutePath("90-Archive/Live.md")]: "# Archived Topic"
      }
    }

    return Effect.gen(function* () {
      const check = yield* CheckService
      const report = yield* check.run(VaultScope.allMarkdown)
      const headingFindings = toArray(report.findings).filter(
        (finding) => finding.category === "headings" || finding.category === "archive-headings"
      )

      assert.deepStrictEqual(summaries(Chunk.fromIterable(headingFindings)), [
        [
          "headings",
          "warning",
          "30-Projects/A.md",
          1,
          "Duplicate active H1: Active Duplicate",
          "30-Projects/A.md",
          ["30-Projects/B.md"]
        ],
        [
          "headings",
          "warning",
          "30-Projects/B.md",
          1,
          "Duplicate active H1: Active Duplicate",
          "30-Projects/B.md",
          ["30-Projects/A.md"]
        ],
        [
          "archive-headings",
          "error",
          "30-Projects/Live.md",
          1,
          "Archive H1 collision: Archived Topic",
          "30-Projects/Live.md",
          ["90-Archive/Live.md"]
        ],
        [
          "archive-headings",
          "error",
          "90-Archive/Live.md",
          1,
          "Archive H1 collision: Archived Topic",
          "90-Archive/Live.md",
          ["30-Projects/Live.md"]
        ]
      ])
    }).pipe(Effect.provide(checkLayer(state)))
  })

  it.effect("reports basename, first H1, and title frontmatter drift", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath("Notes/Drift.md")]: [
          "---",
          "title: Wrong Title",
          "topic: ADHD",
          "status: active",
          "---",
          "# Wrong H1"
        ].join("\n"),
        [absolutePath("Notes/Clean.md")]: ["---", "title: Clean", "topic: ADHD", "---", "# Clean"].join("\n"),
        [absolutePath("Notes/incup-full.md")]: [
          "---",
          "type: source-copy",
          "topic: ADHD",
          "---",
          "# INCUP - Full Copy"
        ].join("\n"),
        [absolutePath("Notes/Normal.md")]: ["---", "type: article", "---", "# Descriptive Normal Title"].join("\n")
      }
    }

    return Effect.gen(function* () {
      const check = yield* CheckService
      const report = yield* check.run(VaultScope.allMarkdown)
      const titleDrift = toArray(report.findings).filter((finding) => finding.category === "title-drift")

      assert.deepStrictEqual(summaries(Chunk.fromIterable(titleDrift)), [
        [
          "title-drift",
          "warning",
          "Notes/Drift.md",
          1,
          "Frontmatter title does not match note title: Wrong Title",
          "Notes/Drift.md",
          []
        ],
        ["title-drift", "warning", "Notes/Drift.md", 6, "H1 does not match note title: Wrong H1", "Notes/Drift.md", []],
        [
          "title-drift",
          "warning",
          "Notes/Normal.md",
          4,
          "H1 does not match note title: Descriptive Normal Title",
          "Notes/Normal.md",
          []
        ]
      ])
    }).pipe(Effect.provide(checkLayer(state)))
  })

  it.effect("excludes ignored markdown files from vault-wide checks", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath(".kbignore")]: ["# Intentional instruction file", "AGENTS.md"].join("\n"),
        [absolutePath("AGENTS.md")]: "# Vault agent instructions",
        [absolutePath("Notes/Drift.md")]: "# Wrong Drift Title"
      }
    }

    return Effect.gen(function* () {
      const check = yield* CheckService
      const report = yield* check.run(VaultScope.allMarkdown)
      const notes = toArray(yield* report.vault.notes())

      assert.deepStrictEqual(
        notes.map((note) => note.path),
        ["Notes/Drift.md"]
      )
      assert.deepStrictEqual(summaries(report.findings), [
        [
          "title-drift",
          "warning",
          "Notes/Drift.md",
          1,
          "H1 does not match note title: Wrong Drift Title",
          "Notes/Drift.md",
          []
        ]
      ])

      const ignoredReport = yield* check.runFile(VaultScope.allMarkdown, "AGENTS.md")
      assert.deepStrictEqual(summaries(ignoredReport.findings), [])
    }).pipe(Effect.provide(checkLayer(state)))
  })

  it.effect("reports stranded dump.md content but not heading-only or blank dump files", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath("dump.md")]: ["# Inbox", "", "stranded note"].join("\n"),
        [absolutePath("Notes/dump.md")]: ["# Heading", "## Child"].join("\n"),
        [absolutePath("Blank/dump.md")]: "\n  \n"
      }
    }

    return Effect.gen(function* () {
      const check = yield* CheckService
      const report = yield* check.run(VaultScope.allMarkdown)
      const dumpFindings = toArray(report.findings).filter((finding) => finding.category === "dump")

      assert.deepStrictEqual(summaries(Chunk.fromIterable(dumpFindings)), [
        ["dump", "warning", "dump.md", 3, "dump.md contains stranded non-heading content", "dump.md", []]
      ])
    }).pipe(Effect.provide(checkLayer(state)))
  })

  it.effect("validates legacy task metadata through CheckService", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath("Tasks.md")]: [
          "# Tasks",
          "- [ ] Bad dates #task [scheduled:: 2026-02-30] [due:: soon] [completed:: 2026-13-01] [area:: Work] [project:: Alpha]",
          "- [ ] Missing metadata #task",
          "- [x] Done missing metadata #task"
        ].join("\n")
      }
    }

    return Effect.gen(function* () {
      const check = yield* CheckService
      const report = yield* check.run(VaultScope.allMarkdown)
      const taskFindings = toArray(report.findings).filter((finding) => finding.category === "tasks")

      assert.deepStrictEqual(messages(Chunk.fromIterable(taskFindings)), [
        "Invalid completed date: 2026-13-01",
        "Invalid due date: soon",
        "Invalid scheduled date: 2026-02-30",
        "Open task is missing [area:: ...] metadata",
        "Open task is missing [project:: ...] metadata"
      ])
      assert.deepStrictEqual(
        taskFindings.map((finding) => [finding.path, finding.position?.start.line, finding.triggerPath]),
        [
          ["Tasks.md", 2, "Tasks.md"],
          ["Tasks.md", 2, "Tasks.md"],
          ["Tasks.md", 2, "Tasks.md"],
          ["Tasks.md", 3, "Tasks.md"],
          ["Tasks.md", 3, "Tasks.md"]
        ]
      )
    }).pipe(Effect.provide(checkLayer(state)))
  })

  it.effect("converts catalog parse diagnostics into catalog findings without failing the report", () => {
    const parseFailure = new MarkdownParseError({ message: "bad markdown", input: "!!!" })
    const state: TestVaultState = {
      files: {
        [absolutePath("Notes/Bad.md")]: "!!!",
        [absolutePath("Notes/Good.md")]: "# Good"
      },
      parseFailures: {
        "Notes/Bad.md": parseFailure
      }
    }

    return Effect.gen(function* () {
      const check = yield* CheckService
      const report = yield* check.run(VaultScope.allMarkdown)

      assert.deepStrictEqual(summaries(report.findings), [
        ["catalog", "error", "Notes/Bad.md", undefined, "bad markdown", "Notes/Bad.md", []]
      ])
    }).pipe(Effect.provide(checkLayer(state)))
  })

  it.effect("runFile and runFiles select analyzer triggers while retaining scoped relationship indexes", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath("Links/Trigger.md")]: ["# Trigger", "[[Shared Target]]"].join("\n"),
        [absolutePath("30-Projects/A/Shared Target.md")]: "# Shared Target",
        [absolutePath("30-Projects/B/Shared Target.md")]: "# Shared Target"
      }
    }

    return Effect.gen(function* () {
      const check = yield* CheckService
      const fileReport = yield* check.runFile(VaultScope.allMarkdown, "Links/Trigger.md")
      const filesReport = yield* check.runFiles(VaultScope.allMarkdown, Chunk.of("30-Projects/A/Shared Target.md"))

      assert.deepStrictEqual(summaries(fileReport.findings), [
        [
          "links",
          "warning",
          "Links/Trigger.md",
          2,
          "Ambiguous link: [[Shared Target]]",
          "Links/Trigger.md",
          ["30-Projects/A/Shared Target.md", "30-Projects/B/Shared Target.md"]
        ]
      ])
      assert.deepStrictEqual(summaries(filesReport.findings), [
        [
          "headings",
          "warning",
          "30-Projects/A/Shared Target.md",
          1,
          "Duplicate active H1: Shared Target",
          "30-Projects/A/Shared Target.md",
          ["30-Projects/B/Shared Target.md"]
        ]
      ])
    }).pipe(Effect.provide(checkLayer(state)))
  })

  it.effect("runFile calls analyzers only for the requested path", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath("Selected.md")]: "# Selected",
        [absolutePath("Unrelated.md")]: "# Unrelated"
      }
    }
    const check = make({
      analyzeFile: (path: string) =>
        Effect.succeed(
          Chunk.of(
            new CheckModel.CheckFinding({
              category: "catalog",
              severity: "warning",
              path,
              message: `checked ${path}`,
              triggerPath: path
            })
          )
        )
    })

    return Effect.gen(function* () {
      const report = yield* check.runFile(VaultScope.allMarkdown, "Selected.md")

      assert.deepStrictEqual(summaries(report.findings), [
        ["catalog", "warning", "Selected.md", undefined, "checked Selected.md", "Selected.md", []]
      ])
    }).pipe(Effect.provide(vaultLayer(state)))
  })
  it.effect("honors VaultScope glob selection and preserves the finding scope", () => {
    const state: TestVaultState = {
      files: {
        [absolutePath("30-Projects/Drift.md")]: "# Wrong Project Title",
        [absolutePath("20-Areas/Drift.md")]: "# Wrong Area Title"
      }
    }
    const scope = VaultScope.fromPath("30-Projects")

    return Effect.gen(function* () {
      const check = yield* CheckService
      const report = yield* check.run(scope)

      assert.deepStrictEqual(toArray(report.scope.patterns), ["30-Projects/**/*.md"])
      assert.deepStrictEqual(summaries(report.findings), [
        [
          "title-drift",
          "warning",
          "30-Projects/Drift.md",
          1,
          "H1 does not match note title: Wrong Project Title",
          "30-Projects/Drift.md",
          []
        ]
      ])
    }).pipe(Effect.provide(checkLayer(state)))
  })
})
