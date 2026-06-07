import { Schema } from "effect"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { DataviewEvaluateError, DataviewTaskQuery } from "./DataviewAst"
import type { DataviewRecord } from "./DataviewResult"

export class DataviewRecordSourceError extends Schema.TaggedErrorClass<DataviewRecordSourceError>(
  "@kb/dataview/DataviewRecordSourceError"
)("RecordSourceError", {
  message: Schema.String
}) {}

export type DataviewRecordSourceService = {
  readonly recordsFor: (
    query: DataviewTaskQuery
  ) => Effect.Effect<ReadonlyArray<DataviewRecord>, DataviewEvaluateError | DataviewRecordSourceError>
}

export class DataviewRecordSource extends Context.Service<DataviewRecordSource, DataviewRecordSourceService>()(
  "@kb/dataview/DataviewRecordSource"
) {
  static layerFromRecords(
    recordsFor: DataviewRecordSourceService["recordsFor"]
  ): Layer.Layer<DataviewRecordSource> {
    return Layer.succeed(this, this.of({ recordsFor }))
  }
}

