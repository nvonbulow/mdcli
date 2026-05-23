import { Data } from "effect"

export type SortDirection = "ASC" | "DESC"
export type BinaryOperator = "=" | "!=" | ">" | ">=" | "<" | "<=" | "AND" | "OR"
export type UnaryOperator = "!"

export type DataviewExpression = Data.TaggedEnum<{
  readonly Identifier: { readonly name: string }
  readonly StringLiteral: { readonly value: string }
  readonly NumberLiteral: { readonly value: number }
  readonly BooleanLiteral: { readonly value: boolean }
  readonly Call: { readonly callee: DataviewExpression; readonly args: ReadonlyArray<DataviewExpression> }
  readonly Unary: { readonly operator: UnaryOperator; readonly operand: DataviewExpression }
  readonly Binary: {
    readonly operator: BinaryOperator
    readonly left: DataviewExpression
    readonly right: DataviewExpression
  }
}>
export const DataviewExpression = Data.taggedEnum<DataviewExpression>()

export class DataviewSortTerm extends Data.TaggedClass("SortTerm")<{
  readonly expression: DataviewExpression
  readonly direction: SortDirection
}> {}

export class DataviewGroupTerm extends Data.TaggedClass("GroupTerm")<{
  readonly expression: DataviewExpression
}> {}

export class DataviewTaskQuery extends Data.TaggedClass("TaskQuery")<{
  readonly kind: string
  readonly source: DataviewExpression | undefined
  readonly predicates: ReadonlyArray<DataviewExpression>
  readonly groupBy: DataviewGroupTerm | undefined
  readonly sort: ReadonlyArray<DataviewSortTerm>
}> {}

export class DataviewParseError extends Data.TaggedClass("ParseError")<{
  readonly input: string
  readonly message: string
  readonly line: number | undefined
}> {}

export class DataviewEvaluateError extends Data.TaggedClass("EvaluateError")<{
  readonly message: string
}> {}

export type DataviewError = DataviewParseError | DataviewEvaluateError
