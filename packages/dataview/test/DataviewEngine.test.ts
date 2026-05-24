import { assert, describe, it } from "@effect/vitest"
import {
  CalendarService,
  VaultService,
  MarkdownModel,
  ParsedTask,
  TaskSource,
  type IsoDate,
  type VaultScope
} from "@kb/vault"
import { Chunk, Effect, Layer, Trie } from "effect"
import {
  DataviewEvaluator,
  DataviewExpression,
  DataviewFunctionRegistry,
  DataviewParser,
  DataviewProgram,
  DataviewRecord,
  DataviewRecordSource,
  DataviewTaskQuery
} from "../src"

const source = (lineNumber: number, path = "Inbox.md"): TaskSource => new TaskSource({ path, lineNumber })

const parsed = (text: string, lineNumber: number, overrides: Partial<ParsedTask> = {}): ParsedTask =>
  new ParsedTask({
    done: false,
    text,
    source: source(lineNumber),
    fields: {},
    unknownFields: {},
    tags: ["#task"],
    area: "[[Ops]]",
    project: "[[Migration]]",
    ...overrides
  })

const record = (
  fields: Readonly<Record<string, string | number | boolean | null | ReadonlyArray<string | number | boolean | null>>>
): DataviewRecord => new DataviewRecord({ fields, original: undefined })

const parserEvaluatorLayer = Layer.mergeAll(DataviewParser.layerNoDeps, DataviewEvaluator.layerNoDeps)

const vaultTaskRecord = (task: ParsedTask) => ({
  path: task.source.path,
  file: new MarkdownModel.MarkdownFile({ path: task.source.path, contents: "", mdast: { type: "root", children: [] } }),
  node: {
    type: "listItem",
    children: [],
    data: { obsidianTask: { done: task.done, text: task.text, rawText: task.text, tags: [], inlineFields: [] } }
  } as never,
  task,
  done: task.done,
  text: task.text,
  fields: task.fields,
  unknownFields: task.unknownFields,
  tags: Chunk.fromIterable(task.tags)
})

const scopeKey = (scope: VaultScope): string => {
  const pattern = Chunk.toReadonlyArray(scope.patterns)[0] ?? ""
  return pattern.endsWith("/**/*.md") ? pattern.slice(0, -"/**/*.md".length) : pattern
}

const vaultLayer = (tasksBySource: Readonly<Record<string, ReadonlyArray<ParsedTask>>>) =>
  Layer.succeed(
    VaultService,
    VaultService.of({
      readText: () => Effect.succeed(""),
      writeText: () => Effect.void,
      readMarkdown: () => Effect.die(new Error("readMarkdown should not be used by dataview tests")),
      readMarkdownTree: () => Effect.die(new Error("readMarkdownTree should not be used by dataview tests")),
      scoped: (scope) =>
        Effect.succeed({
          scope,
          tree: { root: "", files: Trie.empty() },
          notes: () => Effect.succeed(Chunk.empty()),
          frontmatter: () => Effect.succeed(Chunk.empty()),
          headings: () => Effect.succeed(Chunk.empty()),
          links: () => Effect.succeed(Chunk.empty()),
          tags: () => Effect.succeed(Chunk.empty()),
          listItems: () => Effect.succeed(Chunk.empty()),
          tasks: () => Effect.succeed(Chunk.fromIterable((tasksBySource[scopeKey(scope)] ?? []).map(vaultTaskRecord))),
          fencedBlocks: () => Effect.succeed(Chunk.empty()),
          diagnostics: () => Effect.succeed(Chunk.empty()),
          search: () => Effect.succeed(Chunk.empty()),
          sourceLine: () => undefined,
          sourceExcerpt: () => undefined
        })
    })
  )

const programLayer = (
  tasksBySource: Readonly<Record<string, ReadonlyArray<ParsedTask>>>,
  today: IsoDate = "2026-05-23"
) =>
  DataviewProgram.layerNoDeps.pipe(
    Layer.provide(
      Layer.mergeAll(
        DataviewParser.layerNoDeps,
        DataviewRecordSource.layerNoDeps,
        DataviewEvaluator.layerNoDeps,
        DataviewFunctionRegistry.layerNoDeps
      )
    ),
    Layer.provide(Layer.mergeAll(vaultLayer(tasksBySource), CalendarService.layerTest(today)))
  )

describe("DataviewParser", () => {
  it.effect("parses dynamic source, repeated filters, grouping, sorting, literals, nesting, and calls", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const query = yield* parser.parse(`TASK
FROM sourceName
WHERE !completed AND contains(tags, "#task")
WHERE (scheduled >= date(2026) AND priority >= 2) OR flagged = true
GROUP BY coalesce(area, "None")
SORT due ASC, score DESC, lower(file.link) ASC`)

      assert.strictEqual(query.kind, "TASK")
      assert.deepStrictEqual(query.source, DataviewExpression.Identifier({ name: "sourceName" }))
      assert.strictEqual(query.predicates.length, 2)
      assert.deepStrictEqual(
        query.predicates[0],
        DataviewExpression.Binary({
          operator: "AND",
          left: DataviewExpression.Unary({
            operator: "!",
            operand: DataviewExpression.Identifier({ name: "completed" })
          }),
          right: DataviewExpression.Call({
            callee: DataviewExpression.Identifier({ name: "contains" }),
            args: [
              DataviewExpression.Identifier({ name: "tags" }),
              DataviewExpression.StringLiteral({ value: "#task" })
            ]
          })
        })
      )
      assert.deepStrictEqual(
        query.predicates[1],
        DataviewExpression.Binary({
          operator: "OR",
          left: DataviewExpression.Binary({
            operator: "AND",
            left: DataviewExpression.Binary({
              operator: ">=",
              left: DataviewExpression.Identifier({ name: "scheduled" }),
              right: DataviewExpression.Call({
                callee: DataviewExpression.Identifier({ name: "date" }),
                args: [DataviewExpression.NumberLiteral({ value: 2026 })]
              })
            }),
            right: DataviewExpression.Binary({
              operator: ">=",
              left: DataviewExpression.Identifier({ name: "priority" }),
              right: DataviewExpression.NumberLiteral({ value: 2 })
            })
          }),
          right: DataviewExpression.Binary({
            operator: "=",
            left: DataviewExpression.Identifier({ name: "flagged" }),
            right: DataviewExpression.BooleanLiteral({ value: true })
          })
        })
      )
      assert.deepStrictEqual(
        query.groupBy?.expression,
        DataviewExpression.Call({
          callee: DataviewExpression.Identifier({ name: "coalesce" }),
          args: [DataviewExpression.Identifier({ name: "area" }), DataviewExpression.StringLiteral({ value: "None" })]
        })
      )
      assert.deepStrictEqual(
        query.sort.map((term) => term.direction),
        ["ASC", "DESC", "ASC"]
      )
      assert.deepStrictEqual(
        query.sort[2]?.expression,
        DataviewExpression.Call({
          callee: DataviewExpression.Identifier({ name: "lower" }),
          args: [DataviewExpression.Identifier({ name: "file.link" })]
        })
      )
    }).pipe(Effect.provide(DataviewParser.layerNoDeps))
  )
})

describe("DataviewEvaluator", () => {
  it.effect("evaluates dynamic filters, sorts, groups, and calls from record fields", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const evaluator = yield* DataviewEvaluator
      const queryText = `TASK
FROM "ignored"
WHERE !completed
WHERE contains(tags, "#task") AND (score >= 2 OR flagged = true)
GROUP BY area
SORT due ASC, score DESC`
      const query = yield* parser.parse(queryText)
      const result = yield* evaluator.evaluate(
        queryText,
        query,
        [
          record({
            text: "low",
            completed: false,
            tags: ["#task"],
            score: 1,
            flagged: false,
            area: "Work",
            due: "2026-05-24"
          }),
          record({
            text: "beta",
            completed: false,
            tags: ["#task"],
            score: 2,
            flagged: false,
            area: "Home",
            due: "2026-05-24"
          }),
          record({
            text: "done",
            completed: true,
            tags: ["#task"],
            score: 9,
            flagged: true,
            area: "Work",
            due: "2026-05-22"
          }),
          record({
            text: "alpha",
            completed: false,
            tags: ["#task"],
            score: 5,
            flagged: false,
            area: "Work",
            due: "2026-05-23"
          }),
          record({
            text: "flagged",
            completed: false,
            tags: ["#task"],
            score: 0,
            flagged: true,
            area: "Home",
            due: "2026-05-25"
          }),
          record({
            text: "untagged",
            completed: false,
            tags: ["#note"],
            score: 9,
            flagged: true,
            area: "Other",
            due: "2026-05-21"
          })
        ],
        {
          functions: {
            contains: (args) => Array.isArray(args[0]) && args[0].includes(args[1] ?? null)
          }
        }
      )

      assert.strictEqual(result._tag, "QueryResult")
      assert.deepStrictEqual(
        result.rows.map((row) => row.cells.text),
        ["alpha", "beta", "flagged"]
      )
      assert.deepStrictEqual(
        result.groups.map((group) => ({ key: group.key, rows: group.rowIndexes })),
        [
          { key: "Work", rows: [0] },
          { key: "Home", rows: [1, 2] }
        ]
      )
    }).pipe(Effect.provide(parserEvaluatorLayer))
  )
})

describe("DataviewRecordSource and DataviewProgram", () => {
  it.effect("read records only from the query source through VaultService", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const recordSource = yield* DataviewRecordSource
      const query = yield* parser.parse(`TASK
FROM "Inbox"`)
      const records = yield* recordSource.recordsFor(query)

      assert.deepStrictEqual(
        records.map((item) => item.fields.text),
        ["inbox task"]
      )
      assert.deepStrictEqual(
        records.map((item) => item.fields["file.path"]),
        ["Inbox.md"]
      )
    }).pipe(
      Effect.provide(Layer.mergeAll(DataviewParser.layerNoDeps, DataviewRecordSource.layerNoDeps)),
      Effect.provide(
        vaultLayer({
          Inbox: [parsed("inbox task", 4, { source: source(4, "Inbox.md") })],
          Projects: [parsed("project task", 5, { source: source(5, "Projects.md") })]
        })
      )
    )
  )

  it.effect("runs the full service program without any hardcoded fallback source", () =>
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
    }).pipe(
      Effect.provide(
        programLayer({
          Inbox: [
            parsed("inbox only", 1, {
              fields: { scheduled: "2026-05-20" },
              scheduled: "2026-05-20",
              source: source(1, "Inbox.md")
            })
          ],
          Projects: [
            parsed("project later", 2, {
              fields: { scheduled: "2026-05-25" },
              scheduled: "2026-05-25",
              source: source(2, "Projects/Later.md")
            }),
            parsed("project soon", 3, {
              fields: { scheduled: "2026-05-24" },
              scheduled: "2026-05-24",
              source: source(3, "Projects/Soon.md")
            }),
            parsed("project done", 4, {
              done: true,
              fields: { scheduled: "2026-05-23" },
              scheduled: "2026-05-23",
              source: source(4, "Projects/Done.md")
            })
          ]
        })
      )
    )
  )

  it.effect("fails instead of falling back when the query omits FROM", () =>
    Effect.gen(function* () {
      const recordSource = yield* DataviewRecordSource
      const error = yield* recordSource
        .recordsFor(
          new DataviewTaskQuery({
            kind: "TASK",
            source: undefined,
            predicates: [],
            groupBy: undefined,
            sort: []
          })
        )
        .pipe(Effect.flip)

      assert.strictEqual(error.message, "Dataview query must specify an explicit source")
    }).pipe(
      Effect.provide(DataviewRecordSource.layerNoDeps),
      Effect.provide(
        vaultLayer({
          Inbox: [parsed("unused", 1)]
        })
      )
    )
  )
})
