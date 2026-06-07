import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DataviewEvaluator, DataviewExpression, DataviewParser, DataviewRecord } from "../src"

const record = (
  fields: Readonly<Record<string, string | number | boolean | null | ReadonlyArray<string | number | boolean | null>>>
): DataviewRecord => new DataviewRecord({ fields, original: undefined })

const parserEvaluatorLayer = Layer.mergeAll(DataviewParser.layerNoDeps, DataviewEvaluator.layerNoDeps)

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

