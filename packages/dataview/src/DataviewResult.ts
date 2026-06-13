import { Schema } from "effect"

export const DataviewScalar = Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null])
export type DataviewScalar = typeof DataviewScalar.Type

export type DataviewObject = Schema.JsonObject

export const DataviewValue = Schema.Json
export type DataviewValue = typeof DataviewValue.Type

export class DataviewRecord extends Schema.TaggedClass<DataviewRecord>("@kb/dataview/DataviewRecord")("Record", {
  fields: Schema.Record(Schema.String, DataviewValue),
  original: Schema.Unknown
}) {}

export class DataviewColumn extends Schema.TaggedClass<DataviewColumn>("@kb/dataview/DataviewColumn")("Column", {
  key: Schema.String,
  label: Schema.String
}) {}

export class DataviewRow extends Schema.TaggedClass<DataviewRow>("@kb/dataview/DataviewRow")("Row", {
  cells: Schema.Record(Schema.String, DataviewValue),
  record: DataviewRecord
}) {}

export class DataviewGroup extends Schema.TaggedClass<DataviewGroup>("@kb/dataview/DataviewGroup")("Group", {
  key: Schema.String,
  label: Schema.String,
  rowIndexes: Schema.Array(Schema.Number)
}) {}

export class DataviewMetadata extends Schema.TaggedClass<DataviewMetadata>("@kb/dataview/DataviewMetadata")(
  "Metadata",
  {
    query: Schema.String,
    source: Schema.UndefinedOr(DataviewValue)
  }
) {}

const DataviewResultSchema = Schema.TaggedUnion({
  QueryResult: {
    columns: Schema.Array(DataviewColumn),
    rows: Schema.Array(DataviewRow),
    groups: Schema.Array(DataviewGroup),
    metadata: DataviewMetadata
  }
})

export const DataviewResult = Object.assign(DataviewResultSchema, {
  QueryResult: (
    input: Parameters<typeof DataviewResultSchema.cases.QueryResult.make>[0],
    options?: Parameters<typeof DataviewResultSchema.cases.QueryResult.make>[1]
  ) => DataviewResultSchema.cases.QueryResult.make(input, options)
})
export type DataviewResult = typeof DataviewResult.Type
