import { Effect, Schema } from "effect"
import type { FileSystem } from "effect/FileSystem"
import type { Path } from "effect/Path"
import type { ParsedTask } from "./TaskModel"
import type { TaskParseError } from "./VaultErrors"
import { VaultIoError } from "./VaultErrors"
import { VaultService } from "./VaultService"

export class ReadVaultOptions extends Schema.Class<ReadVaultOptions>("@kb/vault/ReadVaultOptions")({
  root: Schema.optionalKey(Schema.String),
  projectsPath: Schema.optionalKey(Schema.String)
}) {}

export const readProjectTasks = Effect.fn("readProjectTasks")(function* (
  options: ReadVaultOptions = new ReadVaultOptions()
) {
  const root = yield* requiredOption("root", options.root)
  const source = yield* requiredOption("projectsPath", options.projectsPath)

  return yield* Effect.flatMap(VaultService, (vault) => vault.readTasks(source)).pipe(
    Effect.provide(VaultService.makeLayer({ root }))
  )
})

export type ReadProjectTasksEffect = Effect.Effect<
  ReadonlyArray<ParsedTask>,
  VaultIoError | TaskParseError,
  FileSystem | Path
>

const requiredOption = (name: string, value: string | undefined): Effect.Effect<string, VaultIoError> =>
  value === undefined || value === ""
    ? Effect.fail(
        new VaultIoError({
          operation: "readProjectTasks",
          path: name,
          message: `Missing required ${name}`
        })
      )
    : Effect.succeed(value)
