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
  Vault,
  VaultService,
  type MarkdownParseError,
  type VaultScope
} from "@kb/vault-core"
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
const recordSourceLayer = DataviewVaultRecordSource.layerNoDeps.pipe(Layer.provide(vaultLayer(testVault)))

const programLayer = DataviewProgram.layerNoDeps.pipe(
  Layer.provide(
    Layer.mergeAll(
      DataviewParser.layerNoDeps,
      DataviewVaultRecordSource.layerNoDeps,
      DataviewEvaluator.layerNoDeps,
      DataviewFunctionRegistry.layerTest("2026-05-23")
    )
  ),
  Layer.provide(vaultLayer(testVault))
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
