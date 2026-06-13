import { Data, Schema } from "effect"

export const DataviewQueryKind = Schema.Enum({ Task: "Task", List: "List", Table: "Table" } as const)
export type DataviewQueryKind = typeof DataviewQueryKind.Type

export const DataviewSortDirection = Schema.Enum({ Asc: "Asc", Desc: "Desc" } as const)
export type DataviewSortDirection = typeof DataviewSortDirection.Type

export const DataviewBinaryOperator = Schema.Enum({
  Equal: "Equal",
  NotEqual: "NotEqual",
  GreaterThan: "GreaterThan",
  GreaterThanOrEqual: "GreaterThanOrEqual",
  LessThan: "LessThan",
  LessThanOrEqual: "LessThanOrEqual",
  And: "And",
  Or: "Or"
} as const)
export type DataviewBinaryOperator = typeof DataviewBinaryOperator.Type

export const DataviewUnaryOperator = Schema.Enum({ Not: "Not" } as const)
export type DataviewUnaryOperator = typeof DataviewUnaryOperator.Type

type DataviewExpressionModel =
  | { readonly _tag: "Identifier"; readonly name: string }
  | { readonly _tag: "StringLiteral"; readonly value: string }
  | { readonly _tag: "NumberLiteral"; readonly value: number }
  | { readonly _tag: "BooleanLiteral"; readonly value: boolean }
  | { readonly _tag: "Call"; readonly callee: DataviewExpressionModel; readonly args: ReadonlyArray<DataviewExpressionModel> }
  | { readonly _tag: "Unary"; readonly operator: DataviewUnaryOperator; readonly operand: DataviewExpressionModel }
  | {
      readonly _tag: "Binary"
      readonly operator: DataviewBinaryOperator
      readonly left: DataviewExpressionModel
      readonly right: DataviewExpressionModel
    }

const DataviewExpressionRef: Schema.Codec<DataviewExpressionModel> = Schema.suspend(
  (): Schema.Codec<DataviewExpressionModel> => DataviewExpressionSchema
)

export const DataviewExpressionSchema: Schema.Codec<DataviewExpressionModel> = Schema.TaggedUnion({
  Identifier: { name: Schema.String },
  StringLiteral: { value: Schema.String },
  NumberLiteral: { value: Schema.Number },
  BooleanLiteral: { value: Schema.Boolean },
  Call: { callee: DataviewExpressionRef, args: Schema.Array(DataviewExpressionRef) },
  Unary: { operator: DataviewUnaryOperator, operand: DataviewExpressionRef },
  Binary: { operator: DataviewBinaryOperator, left: DataviewExpressionRef, right: DataviewExpressionRef }
})
export type DataviewExpression = typeof DataviewExpressionSchema.Type
export const DataviewExpression = Data.taggedEnum<DataviewExpression>()

export class DataviewSortTerm extends Schema.TaggedClass<DataviewSortTerm>(
  "@kb/dataview/DataviewSortTerm"
)("SortTerm", {
  expression: DataviewExpressionSchema,
  direction: DataviewSortDirection
}) {}

export class DataviewGroupTerm extends Schema.TaggedClass<DataviewGroupTerm>(
  "@kb/dataview/DataviewGroupTerm"
)("GroupTerm", {
  expression: DataviewExpressionSchema
}) {}

export class DataviewProjection extends Schema.TaggedClass<DataviewProjection>(
  "@kb/dataview/DataviewProjection"
)("Projection", {
  expression: DataviewExpressionSchema,
  label: Schema.String
}) {}

export class DataviewQuery extends Schema.TaggedClass<DataviewQuery>("@kb/dataview/DataviewQuery")("Query", {
  kind: DataviewQueryKind,
  projections: Schema.Array(DataviewProjection),
  withoutId: Schema.Boolean,
  source: Schema.UndefinedOr(DataviewExpressionSchema),
  predicates: Schema.Array(DataviewExpressionSchema),
  groupBy: Schema.UndefinedOr(DataviewGroupTerm),
  sort: Schema.Array(DataviewSortTerm),
  limit: Schema.UndefinedOr(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)))
}) {}

export { DataviewEvaluateError, DataviewParseError, type DataviewError } from "./DataviewErrors"
