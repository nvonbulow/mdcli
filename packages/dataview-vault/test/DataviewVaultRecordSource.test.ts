import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import {
  DataviewEvaluator,
  DataviewFunctionRegistry,
  DataviewParser,
  DataviewProgram,
  DataviewQuery,
  DataviewQueryKind,
  DataviewRecordSource
} from "@kb/dataview"
import { DataviewVaultRecordSource } from "@kb/dataview-vault"
import {
  Glob,
  MarkdownModel,
  MarkdownParser,
  Vault,
  VaultService,
  type MarkdownParseError,
  type VaultScope
} from "@kb/vault-core"
import { TaskRecurrenceService } from "@kb/vault-tasks"
import { Effect, Layer, Result, Trie } from "effect"
import { fileURLToPath } from "node:url"

const testVault = {
  "Inbox.md": "- [ ] inbox task #task [scheduled:: 2026-05-20] [area:: [[Ops]]]",
  "Projects/Later.md": "- [ ] project later #task [scheduled:: 2026-05-25] [area:: [[Work]]]",
  "Projects/Soon.md": "- [ ] project soon #task [scheduled:: 2026-05-24] [area:: [[Work]]]",
  "Projects/Done.md": "- [x] project done #task [scheduled:: 2026-05-23] [area:: [[Work]]]"
}

const vaultLayer = (filesByPath: Readonly<Record<string, string>>) =>
  Layer.effect(
    VaultService,
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      const parseMarkdown = (path: string, contents: string) =>
        Effect.map(
          parser.parse(contents),
          (file) => new MarkdownModel.MarkdownFile({ path, contents: file.contents, mdast: file.mdast })
        )
      const readMarkdownFiles = (scope: VaultScope) =>
        Effect.gen(function* () {
          const files = yield* Effect.forEach(Object.entries(filesByPath), ([path, contents]) =>
            Effect.match(parseMarkdown(path, contents), {
              onFailure: (failure) =>
                [path, Result.fail(failure) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>] as const,
              onSuccess: (file) =>
                [path, Result.succeed(file) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>] as const
            })
          )
          return Trie.filter(Trie.fromIterable(files), (_result, path) => matchesScope(scope, path))
        })

      return VaultService.of({
        readText: () => Effect.succeed(""),
        writeText: () => Effect.void,
        readMarkdown: (path: string) => parseMarkdown(path, filesByPath[path] ?? ""),
        readMarkdownFiles,
        scoped: (scope: VaultScope) => Effect.flatMap(readMarkdownFiles(scope), (files) => Vault.make({ scope, files }))
      } as unknown as VaultService)
    })
  ).pipe(Layer.provide(MarkdownParser.layer))


const matchesScope = (scope: VaultScope, path: string): boolean => {
  for (const pattern of scope.patterns) {
    if (pattern === "**/*.md" || pattern === path) {
      return true
    }
    if (pattern.endsWith("/**/*.md") && path.startsWith(`${pattern.slice(0, -"/**/*.md".length)}/`)) {
      return true
    }
    if (pattern.endsWith("*.md") && path.startsWith(pattern.slice(0, -"*.md".length))) {
      return true
    }
  }
  return false
}
const recordSourceLayer = DataviewVaultRecordSource.layerNoDeps.pipe(
  Layer.provide(Layer.mergeAll(vaultLayer(testVault), TaskRecurrenceService.layerNoDeps))
)

const programLayer = DataviewProgram.layerNoDeps.pipe(
  Layer.provide(
    Layer.mergeAll(
      DataviewParser.layerNoDeps,
      DataviewVaultRecordSource.layerNoDeps,
      DataviewEvaluator.layerNoDeps,
      DataviewFunctionRegistry.layerTest("2026-05-23")
    )
  ),
  Layer.provide(TaskRecurrenceService.layerNoDeps),
  Layer.provide(vaultLayer(testVault))
)

const fixtureVaultRoot = fileURLToPath(new URL("./fixtures/dataview-query-vault", import.meta.url))
const fixtureVaultLayer = VaultService.makeLayer({ root: fixtureVaultRoot }).pipe(
  Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, Glob.layer))
)

const fixtureProgramLayer = DataviewProgram.layerNoDeps.pipe(
  Layer.provide(
    Layer.mergeAll(
      DataviewParser.layerNoDeps,
      DataviewVaultRecordSource.layerNoDeps,
      DataviewEvaluator.layerNoDeps,
      DataviewFunctionRegistry.layerTest("2026-05-23")
    )
  ),
  Layer.provide(TaskRecurrenceService.layerNoDeps),
  Layer.provide(fixtureVaultLayer)
)


describe("DataviewVaultRecordSource", () => {
  it.effect("reads records only from the query source through VaultService", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const recordSource = yield* DataviewRecordSource
      const query = yield* parser.parse(`TASK
FROM "Inbox.md"`)
      const records = yield* recordSource.recordsFor(query)

      assert.deepStrictEqual(
        records.map((record) => record.fields.text),
        ["inbox task"]
      )
      assert.deepStrictEqual(
        records.map((record) => record.fields["file.path"]),
        ["Inbox.md"]
      )
    }).pipe(Effect.provide(Layer.mergeAll(DataviewParser.layerNoDeps, recordSourceLayer)))
  )

  it.effect("runs DataviewProgram with the vault-backed adapter", () =>
    Effect.gen(function* () {
      const program = yield* DataviewProgram
      const result = yield* program.run(`TASK
FROM "Projects"
WHERE !completed AND contains(tags, "#task")
SORT scheduled ASC`)

      assert.strictEqual(result._tag, "QueryResult")
      assert.deepStrictEqual(
        result.rows.map((row) => row.cells.text),
        ["project soon", "project later"]
      )
      assert.deepStrictEqual(result.metadata.source, "Projects")
    }).pipe(Effect.provide(programLayer))
  )

  it.effect("returns all task records when the query omits FROM", () =>
    Effect.gen(function* () {
      const recordSource = yield* DataviewRecordSource
      const records = yield* recordSource.recordsFor(
        new DataviewQuery({
          kind: DataviewQueryKind.enums.Task,
          projections: [],
          withoutId: false,
          source: undefined,
          predicates: [],
          groupBy: undefined,
          sort: [],
          limit: undefined
        })
      )

      assert.deepStrictEqual(
        Array.from(records, (record) => record.fields.text).sort(),
        ["inbox task", "project done", "project later", "project soon"]
      )
    }).pipe(Effect.provide(recordSourceLayer))
  )

  it.effect("runs page queries against a fixture vault through DataviewProgram", () =>
    Effect.gen(function* () {
      const program = yield* DataviewProgram
      const result = yield* program.run(`TABLE type, topic, thoughts.rating AS "Thought Rating", mood, file.folder AS Folder, file.tags AS Tags
FROM #resource
WHERE rating >= 4
SORT topic ASC
LIMIT 1`)

      assert.strictEqual(result._tag, "QueryResult")
      assert.strictEqual(result.rows.length, 1)

      const row = result.rows[0]!
      assert.strictEqual(row.record.fields["file.path"], "Resources/Poe.md")
      assert.strictEqual(row.cells.type, "resource")
      assert.strictEqual(row.cells.topic, "poems")
      assert.strictEqual(row.cells["Thought Rating"], 8)
      assert.strictEqual(row.cells.mood, "gothic")
      assert.strictEqual(row.cells.Folder, "Resources")
      assert.deepStrictEqual(row.cells.Tags, ["#book", "#resource", "#resource/poem", "#literature"])
    }).pipe(Effect.provide(fixtureProgramLayer))
  )

  it.effect("expands recurring task records for today-shaped predicates", () =>
    Effect.gen(function* () {
      const program = yield* DataviewProgram
      const result = yield* program.run(`TASK
FROM "Projects"
WHERE !completed
WHERE scheduled = date(2026-06-15) OR due = date(2026-06-15)
SORT due ASC, scheduled ASC, file.line ASC`)

      assert.deepStrictEqual(
        result.rows.map((row) => [row.cells.text, row.cells.scheduled, row.cells.due]),
        [
          ["Water plants", null, "2026-06-15"],
          ["Prep report", "2026-06-15", "2026-06-22"]
        ]
      )
    }).pipe(Effect.provide(fixtureProgramLayer))
  )

  it.effect("expands recurring task records for week-shaped predicates", () =>
    Effect.gen(function* () {
      const program = yield* DataviewProgram
      const result = yield* program.run(`TASK
FROM "Projects"
WHERE !completed
WHERE (scheduled >= date(2026-06-15) AND scheduled <= date(2026-06-21)) OR (due >= date(2026-06-15) AND due <= date(2026-06-21))
SORT due ASC, scheduled ASC, file.line ASC`)

      assert.deepStrictEqual(
        result.rows.map((row) => [row.cells.text, row.cells.scheduled, row.cells.due]),
        [
          ["Water plants", null, "2026-06-15"],
          ["Prep report", "2026-06-15", "2026-06-22"]
        ]
      )
    }).pipe(Effect.provide(fixtureProgramLayer))
  )

  it.effect("projects recurring task records for overdue-shaped predicates", () =>
    Effect.gen(function* () {
      const program = yield* DataviewProgram
      const result = yield* program.run(`TASK
FROM "Projects"
WHERE !completed
WHERE due <= date(2026-06-14)
SORT due ASC, scheduled ASC, file.line ASC`)

      assert.deepStrictEqual(
        result.rows.map((row) => [row.cells.text, row.cells.scheduled, row.cells.due]),
        [
          ["Unsupported repeat", null, "2026-06-01"],
          ["Prep report", "2026-06-01", "2026-06-08"],
          ["Water plants", null, "2026-06-08"]
        ]
      )
    }).pipe(Effect.provide(fixtureProgramLayer))
  )

  it.effect("does not expand recurring task records for unbounded repeat queries", () =>
    Effect.gen(function* () {
      const program = yield* DataviewProgram
      const result = yield* program.run(`TASK
FROM "Projects"
WHERE repeat
SORT file.line ASC`)

      assert.deepStrictEqual(
        result.rows.map((row) => [row.cells.text, row.cells.due]),
        [
          ["Water plants", "2026-06-01"],
          ["Prep report", "2026-06-08"],
          ["Unsupported repeat", "2026-06-01"]
        ]
      )
    }).pipe(Effect.provide(fixtureProgramLayer))
  )
})
