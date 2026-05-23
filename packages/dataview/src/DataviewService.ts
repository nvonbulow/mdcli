import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { FileSystem } from "effect/FileSystem"
import type { Path } from "effect/Path"
import type { DataviewRecord } from "./DataviewResult"
import { readVaultRecords, type VaultSourceOptions } from "./DataviewVault"

export type VaultRecordsService = {
  readonly read: (options: VaultSourceOptions) => Effect.Effect<ReadonlyArray<DataviewRecord>, Error, FileSystem | Path>
}

export class VaultRecords extends Context.Service<VaultRecords, VaultRecordsService>()("@kb/dataview/VaultRecords") {}

export const makeVaultRecords: Effect.Effect<VaultRecordsService> = Effect.succeed(
  VaultRecords.of({
    read: readVaultRecords
  })
)

export const vaultRecordsLayer: Layer.Layer<VaultRecords> = Layer.effect(VaultRecords, makeVaultRecords)
