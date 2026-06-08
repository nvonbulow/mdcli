import { fromPath, notes, VaultService, type VaultIoError } from "@kb/vault-core"
import { Chunk, Context, Data, Effect, Layer, Schema } from "effect"
import {
  ReadFileRangeSchema,
  ReadFileRequestSchema,
  ReadFileResultSchema,
  VaultIndexResultSchema,
  type ReadFileRange,
  type ReadFileRequest,
  type ReadFileResult,
  type VaultIndexResult
} from "./KbMcpSchemas"

export class ReadFileRangeError extends Data.TaggedError("ReadFileRangeError")<{
  readonly path: string
  readonly message: string
}> {}

export type KbMcpServerShape = {
  readonly vaultIndex: () => Effect.Effect<VaultIndexResult, VaultIoError>
  readonly readFile: (request: ReadFileRequest) => Effect.Effect<ReadFileResult, VaultIoError | ReadFileRangeError>
}

export class KbMcpServer extends Context.Service<KbMcpServer, KbMcpServerShape>()("@kb/mcp-server/KbMcpServer") {
  static readonly layer: Layer.Layer<KbMcpServer, never, VaultService> = Layer.effect(
    KbMcpServer,
    Effect.gen(function* () {
      const vaultService = yield* VaultService
      return KbMcpServer.of({
        vaultIndex: Effect.fn("@kb/mcp-server/KbMcpServer.vaultIndex")(function* () {
          const vault = yield* vaultService.scoped(fromPath("."))
          const result = { notes: Chunk.toReadonlyArray(Chunk.map(notes(vault), (note) => note.path)) }
          return yield* Schema.decodeUnknownEffect(VaultIndexResultSchema)(result).pipe(Effect.orDie)
        }),
        readFile: Effect.fn("@kb/mcp-server/KbMcpServer.readFile")(function* (rawRequest) {
          const request = yield* decodeReadFileRequest(rawRequest)
          const contents = yield* vaultService.readText(request.path)
          const lines = linesFromContents(contents)
          const totalLines = lines.length
          if (request.startLine === undefined && request.endLine === undefined) {
            return yield* decodeReadFileResult(request.path, { path: request.path, contents, totalLines })
          }

          const range = yield* decodeReadFileRange(request.path, {
            startLine: request.startLine ?? 1,
            endLine: request.endLine ?? totalLines
          }, totalLines)
          return yield* decodeReadFileResult(request.path, {
            path: request.path,
            contents: lines.slice(range.startLine - 1, range.endLine).join("\n"),
            startLine: range.startLine,
            endLine: range.endLine,
            totalLines
          })
        })
      })
    })
  )
}

const linesFromContents = (contents: string): ReadonlyArray<string> => (contents.length === 0 ? [] : contents.split("\n"))

const decodeReadFileRequest = (request: ReadFileRequest): Effect.Effect<ReadFileRequest, ReadFileRangeError> =>
  Schema.decodeUnknownEffect(ReadFileRequestSchema)(request).pipe(
    Effect.mapError((error) => readFileSchemaError(request.path, error))
  )

const decodeReadFileRange = (
  path: string,
  range: ReadFileRange,
  totalLines: number
): Effect.Effect<ReadFileRange, ReadFileRangeError> =>
  Schema.decodeUnknownEffect(ReadFileRangeSchema(totalLines))(range).pipe(
    Effect.mapError((error) => readFileSchemaError(path, error))
  )

const decodeReadFileResult = (
  path: string,
  result: ReadFileResult
): Effect.Effect<ReadFileResult, ReadFileRangeError> =>
  Schema.decodeUnknownEffect(ReadFileResultSchema)(result).pipe(
    Effect.mapError((error) => readFileSchemaError(path, error))
  )

const readFileSchemaError = (path: string, error: Schema.SchemaError): ReadFileRangeError =>
  new ReadFileRangeError({ path, message: error.message })
