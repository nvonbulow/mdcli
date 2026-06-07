import { assert, describe, it } from "@effect/vitest"
import {
  DataviewEvaluator,
  DataviewFunctionRegistry,
  DataviewParser,
  DataviewProgram,
  DataviewRecordSource,
  DataviewTaskQuery
} from "@kb/dataview"
import { DataviewVaultRecordSource } from "@kb/dataview-vault"
import {
  MarkdownModel,
  MarkdownParser,
  VaultService,
  type MarkdownParseError,
  type VaultScope
} from "@kb/vault-core"
import { CalendarService } from "@kb/vault-tasks"
import { Effect, Layer, Result, Trie } from "effect"

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
      const readMarkdownTree = (_scope: VaultScope) =>
        Effect.gen(function* () {
          const files = yield* Effect.forEach(Object.entries(filesByPath), ([path, contents]) =>
            Effect.match(parseMarkdown(path, contents), {
              onFailure: (failure) =>
                [path, Result.fail(failure) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>] as const,
              onSuccess: (file) =>
                [path, Result.succeed(file) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>] as const
            })
          )
          return { root: "", files: Trie.fromIterable(files) }
        })

      return VaultService.of({
        readText: () => Effect.succeed(""),
        writeText: () => Effect.void,
        readMarkdown: (path) => parseMarkdown(path, filesByPath[path] ?? ""),
        readMarkdownTree,
        scoped: () => Effect.die(new Error("scoped should not be used by dataview vault tests"))
      })
    })
  ).pipe(Layer.provide(MarkdownParser.layer))

const recordSourceLayer = DataviewVaultRecordSource.layerNoDeps.pipe(Layer.provide(vaultLayer(testVault)))

const programLayer = DataviewProgram.layerNoDeps.pipe(
  Layer.provide(
    Layer.mergeAll(
      DataviewParser.layerNoDeps,
      DataviewVaultRecordSource.layerNoDeps,
      DataviewEvaluator.layerNoDeps,
      DataviewFunctionRegistry.layerNoDeps
    )
  ),
  Layer.provide(Layer.mergeAll(vaultLayer(testVault), CalendarService.layerTest("2026-05-23")))
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

  it.effect("preserves DataviewEvaluateError when the query omits FROM", () =>
    Effect.gen(function* () {
      const recordSource = yield* DataviewRecordSource
      const error = yield* recordSource
        .recordsFor(new DataviewTaskQuery({ kind: "TASK", source: undefined, predicates: [], groupBy: undefined, sort: [] }))
        .pipe(Effect.flip)

      assert.strictEqual(error._tag, "EvaluateError")
      assert.strictEqual(error.message, "Dataview query must specify an explicit source")
    }).pipe(Effect.provide(recordSourceLayer))
  )
})
