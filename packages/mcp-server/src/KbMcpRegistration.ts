import { Effect, Layer, Schema } from "effect"
import { AiError, McpSchema, McpServer, Tool, Toolkit } from "effect/unstable/ai"
import { KbMcpServer, ReadFileRangeError } from "./KbMcpServer"
import {
  ReadFileRequestSchema,
  ReadFileResultSchema,
  VaultIndexResultSchema,
  type ReadFileRequest
} from "./KbMcpSchemas"

export const VaultReadFileTool = Tool.make("vault_read_file", {
  description: "Read a Markdown file from the configured vault, optionally slicing by 1-indexed inclusive lines.",
  parameters: ReadFileRequestSchema,
  success: ReadFileResultSchema
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const KbMcpToolkit = Toolkit.make(VaultReadFileTool)

export const layerRegistration = Layer.mergeAll(
  McpServer.resource({
    uri: "kb://vault/index",
    name: "Vault index",
    description: "JSON index of note paths in the configured vault.",
    mimeType: "application/json",
    content: Effect.gen(function* () {
      const server = yield* KbMcpServer
      const index = yield* server.vaultIndex()
      const encodedIndex = yield* Schema.encodeUnknownEffect(VaultIndexResultSchema)(index)
      return JSON.stringify(encodedIndex)
    })
  }),
  McpServer.resource`kb://vault/file/${McpSchema.param("encodedPath", Schema.String)}`({
    name: "Vault file",
    description: "Markdown contents for an encoded vault-relative path.",
    mimeType: "text/markdown",
    content: Effect.fn(function* (_uri, encodedPath) {
      const server = yield* KbMcpServer
      const path = yield* decodeEncodedPath(encodedPath)
      const file = yield* server.readFile({ path })
      return yield* Schema.decodeUnknownEffect(Schema.String)(file.contents).pipe(Effect.orDie)
    })
  }),
  McpServer.toolkit(KbMcpToolkit).pipe(
    Layer.provideMerge(
      KbMcpToolkit.toLayer(
        Effect.gen(function* () {
          const server = yield* KbMcpServer
          return {
            vault_read_file: (request: ReadFileRequest) => server.readFile(request).pipe(Effect.mapError(toAiError))
          }
        })
      )
    )
  )
).pipe(Layer.provide(KbMcpServer.layer))

export const layerStdio = layerRegistration.pipe(
  Layer.provide(McpServer.layerStdio({ name: "kb", version: "0.1.0" }))
)

const toAiError = (error: { readonly message: string }): AiError.AiError =>
  AiError.make({
    module: "@kb/mcp-server",
    method: "vault_read_file",
    reason: new AiError.InvalidUserInputError({ description: error.message })
  })

const decodeEncodedPath = (encodedPath: string): Effect.Effect<string, ReadFileRangeError> =>
  Effect.try({
    try: () => decodeURIComponent(encodedPath),
    catch: (cause) =>
      new ReadFileRangeError({
        path: encodedPath,
        message: cause instanceof Error ? cause.message : String(cause)
      })
  })
