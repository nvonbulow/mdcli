import { Data } from "effect"

export type DataviewScalar = string | number | boolean | null
export type DataviewValue = DataviewScalar | ReadonlyArray<DataviewScalar>

export class DataviewRecord extends Data.TaggedClass("Record")<{
  readonly fields: Readonly<Record<string, DataviewValue>>
  readonly original: unknown
}> {}

export class DataviewColumn extends Data.TaggedClass("Column")<{
  readonly key: string
  readonly label: string
}> {}

export class DataviewRow extends Data.TaggedClass("Row")<{
  readonly cells: Readonly<Record<string, DataviewValue>>
  readonly record: DataviewRecord
}> {}

export class DataviewGroup extends Data.TaggedClass("Group")<{
  readonly key: string
  readonly label: string
  readonly rowIndexes: ReadonlyArray<number>
}> {}

export class DataviewMetadata extends Data.TaggedClass("Metadata")<{
  readonly query: string
  readonly source: DataviewValue | undefined
}> {}

export type DataviewResult = Data.TaggedEnum<{
  readonly QueryResult: {
    readonly columns: ReadonlyArray<DataviewColumn>
    readonly rows: ReadonlyArray<DataviewRow>
    readonly groups: ReadonlyArray<DataviewGroup>
    readonly metadata: DataviewMetadata
  }
}>
export const DataviewResult = Data.taggedEnum<DataviewResult>()
