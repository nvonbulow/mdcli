import { Schema } from "effect"

export const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
export const PositiveLine = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))

export const VaultIndexResultSchema = Schema.Struct({
  notes: Schema.Array(Schema.String)
})

export type VaultIndexResult = typeof VaultIndexResultSchema.Type

export const ReadFileRequestSchema = Schema.Struct({
  path: Schema.String,
  startLine: Schema.optionalKey(PositiveLine),
  endLine: Schema.optionalKey(PositiveLine)
})

export type ReadFileRequest = typeof ReadFileRequestSchema.Type

export const ReadFileRangeSchema = (totalLines: number) =>
  Schema.Struct({
    startLine: PositiveLine,
    endLine: PositiveLine
  }).check(
    Schema.makeFilter(
      ({ startLine, endLine }) => startLine <= endLine,
      { message: "startLine must be less than or equal to endLine" }
    ),
    Schema.makeFilter(
      ({ endLine }) => endLine <= totalLines,
      { message: "endLine must be less than or equal to totalLines" }
    )
  )

export type ReadFileRange = ReturnType<typeof ReadFileRangeSchema>["Type"]

export const ReadFileResultSchema = Schema.Struct({
  path: Schema.String,
  contents: Schema.String,
  startLine: Schema.optionalKey(PositiveLine),
  endLine: Schema.optionalKey(PositiveLine),
  totalLines: NonNegativeInteger
})

export type ReadFileResult = typeof ReadFileResultSchema.Type
