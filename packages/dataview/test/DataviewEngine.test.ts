import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import {
  DataviewBinaryOperator,
  DataviewEvaluator,
  DataviewExpression,
  DataviewExpressionSchema,
  DataviewParser,
  DataviewQuery,
  DataviewQueryKind,
  DataviewRecord,
  DataviewSortDirection,
  DataviewSortTerm,
  DataviewUnaryOperator,
  DataviewValue
} from "../src"

const record = (fields: Readonly<Record<string, DataviewValue>>): DataviewRecord =>
  new DataviewRecord({ fields, original: undefined })

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

      assert.strictEqual(query._tag, "Query")
      assert.strictEqual(query.kind, DataviewQueryKind.enums.Task)
      assert.deepStrictEqual(query.projections, [])
      assert.strictEqual(query.withoutId, false)
      assert.strictEqual(query.limit, undefined)
      assert.deepStrictEqual(query.source, DataviewExpression.Identifier({ name: "sourceName" }))
      assert.strictEqual(query.predicates.length, 2)
      assert.deepStrictEqual(
        query.predicates[0],
        DataviewExpression.Binary({
          operator: DataviewBinaryOperator.enums.And,
          left: DataviewExpression.Unary({
            operator: DataviewUnaryOperator.enums.Not,
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
          operator: DataviewBinaryOperator.enums.Or,
          left: DataviewExpression.Binary({
            operator: DataviewBinaryOperator.enums.And,
            left: DataviewExpression.Binary({
              operator: DataviewBinaryOperator.enums.GreaterThanOrEqual,
              left: DataviewExpression.Identifier({ name: "scheduled" }),
              right: DataviewExpression.Call({
                callee: DataviewExpression.Identifier({ name: "date" }),
                args: [DataviewExpression.NumberLiteral({ value: 2026 })]
              })
            }),
            right: DataviewExpression.Binary({
              operator: DataviewBinaryOperator.enums.GreaterThanOrEqual,
              left: DataviewExpression.Identifier({ name: "priority" }),
              right: DataviewExpression.NumberLiteral({ value: 2 })
            })
          }),
          right: DataviewExpression.Binary({
            operator: DataviewBinaryOperator.enums.Equal,
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
        [DataviewSortDirection.enums.Asc, DataviewSortDirection.enums.Desc, DataviewSortDirection.enums.Asc]
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

  it.effect("decodes schema-backed query, expression, value, and sort models", () =>
    Effect.gen(function* () {
      const queryShape = {
        _tag: "Query",
        kind: "Table",
        projections: [],
        withoutId: false,
        source: undefined,
        predicates: [],
        groupBy: undefined,
        sort: [],
        limit: 1
      }

      const query = yield* Schema.decodeUnknownEffect(DataviewQuery)(queryShape)
      assert.strictEqual(query.kind, DataviewQueryKind.enums.Table)

      yield* Schema.decodeUnknownEffect(DataviewQuery)({ ...queryShape, kind: "TABLE" }).pipe(Effect.flip)
      yield* Schema.decodeUnknownEffect(DataviewQuery)({ ...queryShape, kind: "Calendar" }).pipe(Effect.flip)

      const expressionShape = {
        _tag: "Binary",
        operator: "GreaterThanOrEqual",
        left: { _tag: "Identifier", name: "rating" },
        right: { _tag: "NumberLiteral", value: 4 }
      }
      const expression = yield* Schema.decodeUnknownEffect(DataviewExpressionSchema)(expressionShape)
      assert.strictEqual(expression._tag, "Binary")
      if (expression._tag === "Binary") {
        assert.deepStrictEqual(expression.left, { _tag: "Identifier", name: "rating" })
        assert.deepStrictEqual(expression.right, { _tag: "NumberLiteral", value: 4 })
        assert.strictEqual(expression.operator, DataviewBinaryOperator.enums.GreaterThanOrEqual)
      }
      yield* Schema.decodeUnknownEffect(DataviewExpressionSchema)({ ...expressionShape, operator: ">=" }).pipe(
        Effect.flip
      )

      const value = yield* Schema.decodeUnknownEffect(DataviewValue)({
        thoughts: { rating: 8 },
        tags: ["#resource", null]
      })
      assert.deepStrictEqual(value, { thoughts: { rating: 8 }, tags: ["#resource", null] })

      const sortTerm = yield* Schema.decodeUnknownEffect(DataviewSortTerm)({
        _tag: "SortTerm",
        expression: { _tag: "Identifier", name: "topic" },
        direction: "Desc"
      })
      assert.strictEqual(sortTerm.direction, DataviewSortDirection.enums.Desc)
      yield* Schema.decodeUnknownEffect(DataviewSortTerm)({
        _tag: "SortTerm",
        expression: { _tag: "Identifier", name: "topic" },
        direction: "DESC"
      }).pipe(Effect.flip)
    })
  )

  it.effect("parses LIST projections, tag sources, and positive LIMIT", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const query = yield* parser.parse(`LIST file.folder FROM #books LIMIT 3`)

      assert.strictEqual(query.kind, DataviewQueryKind.enums.List)
      assert.strictEqual(query.withoutId, false)
      assert.strictEqual(query.limit, 3)
      assert.deepStrictEqual(query.source, DataviewExpression.Identifier({ name: "#books" }))
      assert.strictEqual(query.projections.length, 1)
      assert.strictEqual(query.projections[0]?.label, "file.folder")
      assert.deepStrictEqual(query.projections[0]?.expression, DataviewExpression.Identifier({ name: "file.folder" }))
    }).pipe(Effect.provide(DataviewParser.layerNoDeps))
  )

  it.effect("parses TABLE projections, aliases, filters, sorting, and LIMIT", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const query = yield* parser.parse(
        `TABLE type, topic AS Topic, thoughts.rating AS "Rating" FROM #resource WHERE thoughts.rating >= 4 SORT topic ASC LIMIT 5`
      )

      assert.strictEqual(query.kind, DataviewQueryKind.enums.Table)
      assert.strictEqual(query.withoutId, false)
      assert.strictEqual(query.limit, 5)
      assert.deepStrictEqual(query.source, DataviewExpression.Identifier({ name: "#resource" }))
      assert.deepStrictEqual(
        query.projections.map((projection) => projection.label),
        ["type", "Topic", "Rating"]
      )
      assert.deepStrictEqual(
        query.predicates[0],
        DataviewExpression.Binary({
          operator: DataviewBinaryOperator.enums.GreaterThanOrEqual,
          left: DataviewExpression.Identifier({ name: "thoughts.rating" }),
          right: DataviewExpression.NumberLiteral({ value: 4 })
        })
      )
      assert.deepStrictEqual(query.sort.map((term) => term.direction), [DataviewSortDirection.enums.Asc])
    }).pipe(Effect.provide(DataviewParser.layerNoDeps))
  )

  it.effect("parses TABLE WITHOUT ID with a quoted path source", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const query = yield* parser.parse(`TABLE WITHOUT ID topic FROM "40-Resources"`)

      assert.strictEqual(query.kind, DataviewQueryKind.enums.Table)
      assert.strictEqual(query.withoutId, true)
      assert.strictEqual(query.limit, undefined)
      assert.deepStrictEqual(query.source, DataviewExpression.StringLiteral({ value: "40-Resources" }))
      assert.strictEqual(query.projections.length, 1)
      assert.strictEqual(query.projections[0]?.label, "topic")
    }).pipe(Effect.provide(DataviewParser.layerNoDeps))
  )

  it.effect("rejects unsupported CALENDAR queries", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const error = yield* parser.parse(`CALENDAR file.cday`).pipe(Effect.flip)

      assert.strictEqual(error._tag, "ParseError")
      assert.strictEqual(error.message, "Unsupported Dataview query type: CALENDAR")
    }).pipe(Effect.provide(DataviewParser.layerNoDeps))
  )

  it.effect("rejects non-positive LIMIT values", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const error = yield* parser.parse(`TABLE topic LIMIT 0`).pipe(Effect.flip)

      assert.strictEqual(error._tag, "ParseError")
      assert.strictEqual(error.message, "LIMIT must be a positive integer")
    }).pipe(Effect.provide(DataviewParser.layerNoDeps))
  )

  it.effect("stores parsed query kind, sort direction, and operators as schema enum values", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const sorted = yield* parser.parse(`TABLE topic SORT rating DESC`)
      const filtered = yield* parser.parse(`TABLE topic WHERE !completed AND rating >= 4`)

      assert.strictEqual(sorted.kind, DataviewQueryKind.enums.Table)
      assert.strictEqual(sorted.sort[0]?.direction, DataviewSortDirection.enums.Desc)
      assert.notStrictEqual(sorted.kind, "TABLE")
      assert.notStrictEqual(sorted.sort[0]?.direction, "DESC")

      const predicate = filtered.predicates[0]
      assert.strictEqual(predicate?._tag, "Binary")
      if (predicate?._tag === "Binary") {
        assert.strictEqual(predicate.operator, DataviewBinaryOperator.enums.And)
        assert.notStrictEqual(predicate.operator, "AND")
        assert.strictEqual(predicate.left._tag, "Unary")
        if (predicate.left._tag === "Unary") {
          assert.strictEqual(predicate.left.operator, DataviewUnaryOperator.enums.Not)
          assert.notStrictEqual(predicate.left.operator, "!")
        }
        assert.strictEqual(predicate.right._tag, "Binary")
        if (predicate.right._tag === "Binary") {
          assert.strictEqual(predicate.right.operator, DataviewBinaryOperator.enums.GreaterThanOrEqual)
          assert.notStrictEqual(predicate.right.operator, ">=")
        }
      }
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

  it.effect("evaluates TABLE projections, nested lookups, and LIMIT after sorting", () =>
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const evaluator = yield* DataviewEvaluator
      const queryText = `TABLE WITHOUT ID topic, thoughts.rating AS "Rating"
WHERE thoughts.rating >= 4
SORT topic DESC
LIMIT 2`
      const query = yield* parser.parse(queryText)
      const result = yield* evaluator.evaluate(
        queryText,
        query,
        [
          record({
            "file.link": "alpha.md",
            type: "resource",
            topic: "alpha",
            thoughts: { rating: 8 }
          }),
          record({
            "file.link": "beta.md",
            type: "resource",
            topic: "beta",
            thoughts: { rating: 3 }
          }),
          record({
            "file.link": "omega.md",
            type: "resource",
            topic: "omega",
            thoughts: { rating: 9 }
          }),
          record({
            "file.link": "zeta.md",
            type: "resource",
            topic: "zeta",
            thoughts: { rating: 5 }
          })
        ],
        {
          functions: {}
        }
      )

      assert.deepStrictEqual(
        result.columns.map((column) => ({ key: column.key, label: column.label })),
        [
          { key: "topic", label: "topic" },
          { key: "Rating", label: "Rating" }
        ]
      )
      assert.deepStrictEqual(
        result.rows.map((row) => row.cells),
        [
          { topic: "zeta", Rating: 5 },
          { topic: "omega", Rating: 9 }
        ]
      )
      assert.strictEqual(result.rows.some((row) => "type" in row.cells || "file.link" in row.cells), false)
    }).pipe(Effect.provide(parserEvaluatorLayer))
  )
})
