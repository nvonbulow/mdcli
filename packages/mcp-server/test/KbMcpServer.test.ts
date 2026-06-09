import { assert, describe, it } from "@effect/vitest"
import {
  KbMcpServer,
  layerRegistration,
  ReadFileRangeError
} from "@kb/mcp-server"
import {
  MarkdownModel,
  MarkdownParser,
  Vault,
  VaultIoError,
  VaultService,
  type MarkdownParseError,
  type VaultScope
} from "@kb/vault-core"
import { Effect, Layer, Result, Trie } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import * as McpSchema from "effect/unstable/ai/McpSchema"
import * as McpServer from "effect/unstable/ai/McpServer"
import { RpcSerialization } from "effect/unstable/rpc"
import * as RpcClient from "effect/unstable/rpc/RpcClient"

const testFiles = {
  "Inbox.md": "first line\nsecond line\nthird line",
  "Projects/Plan.md": "# Plan\n\n- [ ] task",
  "data.json": "{}"
}

const vaultLayer = (filesByPath: Readonly<Record<string, string>>) =>
  Layer.effect(
    VaultService,
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      const parseMarkdown = (path: string, contents: string) =>
        Effect.map(
          parser.parse(contents),
          (file) => new MarkdownModel.MarkdownFile({ path, contents: file.contents, mdast: file.mdast })
        )
      const readMarkdownFiles = (scope: VaultScope) =>
        Effect.gen(function* () {
          const files = yield* Effect.forEach(markdownEntries(filesByPath), ([path, contents]) =>
            Effect.match(parseMarkdown(path, contents), {
              onFailure: (failure) =>
                [path, Result.fail(failure) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>] as const,
              onSuccess: (file) =>
                [path, Result.succeed(file) as Result.Result<MarkdownModel.MarkdownFile, MarkdownParseError>] as const
            })
          )
          return Trie.fromIterable(files)
        })

      return VaultService.of({
        readText: (path: string) =>
          path in filesByPath
            ? Effect.succeed(filesByPath[path]!)
            : Effect.fail(new VaultIoError({ operation: "readText", path, message: "Missing test file" })),
        writeText: () => Effect.void,
        readMarkdown: (path: string) => parseMarkdown(path, filesByPath[path] ?? ""),
        readMarkdownFiles,
        scoped: (scope: VaultScope) => Effect.flatMap(readMarkdownFiles(scope), (files) => Vault.make({ scope, files }))
      } as unknown as VaultService)
    })
  ).pipe(Layer.provide(MarkdownParser.layer))

const mcpServerLayer = KbMcpServer.layer.pipe(Layer.provide(vaultLayer(testFiles)))

const makeTestClient = Effect.gen(function* () {
  const serverLayer = layerRegistration.pipe(
    Layer.provide(McpServer.layerHttp({ name: "TestServer", version: "1.0.0", path: "/mcp" })),
    Layer.provide(vaultLayer(testFiles))
  )
  const { handler, dispose } = HttpRouter.toWebHandler(serverLayer, { disableLogger: true })
  yield* Effect.addFinalizer(() => Effect.promise(() => dispose()))

  let sessionId: string | null = null
  const customFetch: typeof fetch = (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    if (sessionId !== null) {
      request.headers.set("Mcp-Session-Id", sessionId)
    }
    return Effect.runPromise(
      Effect.promise(() => handler(request)).pipe(
        Effect.tap((response) =>
          Effect.sync(() => {
            const responseSessionId = response.headers.get("Mcp-Session-Id")
            if (responseSessionId !== null) {
              sessionId = responseSessionId
            }
          })
        )
      )
    )
  }

  const clientLayer = RpcClient.layerProtocolHttp({ url: "http://localhost/mcp" }).pipe(
    Layer.provideMerge([FetchHttpClient.layer, RpcSerialization.layerJsonRpc()]),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, customFetch))
  )

  return yield* RpcClient.make(McpSchema.ClientRpcs).pipe(Effect.provide(clientLayer))
})

describe("KbMcpServer", () => {
  it.effect("returns note paths only for the vault index", () =>
    Effect.gen(function* () {
      const server = yield* KbMcpServer
      const index = yield* server.vaultIndex()

      assert.deepStrictEqual(index.notes, ["Inbox.md", "Projects/Plan.md"])
    }).pipe(Effect.provide(mcpServerLayer))
  )

  it.effect("reads a full file", () =>
    Effect.gen(function* () {
      const server = yield* KbMcpServer
      const result = yield* server.readFile({ path: "Inbox.md" })

      assert.deepStrictEqual(result, {
        path: "Inbox.md",
        contents: "first line\nsecond line\nthird line",
        totalLines: 3
      })
    }).pipe(Effect.provide(mcpServerLayer))
  )

  it.effect("reads a 1-indexed inclusive line range", () =>
    Effect.gen(function* () {
      const server = yield* KbMcpServer
      const result = yield* server.readFile({ path: "Inbox.md", startLine: 2, endLine: 3 })

      assert.deepStrictEqual(result, {
        path: "Inbox.md",
        contents: "second line\nthird line",
        startLine: 2,
        endLine: 3,
        totalLines: 3
      })
    }).pipe(Effect.provide(mcpServerLayer))
  )

  it.effect("fails invalid line ranges through Effect schema validation", () =>
    Effect.gen(function* () {
      const server = yield* KbMcpServer
      const error = yield* server.readFile({ path: "Inbox.md", startLine: 3, endLine: 2 }).pipe(Effect.flip)

      assert.ok(error instanceof ReadFileRangeError)
      assert.match(error.message, /startLine must be less than or equal to endLine/)
    }).pipe(Effect.provide(mcpServerLayer))
  )

  it.effect("fails invalid request fields through Effect schema validation", () =>
    Effect.gen(function* () {
      const server = yield* KbMcpServer
      const error = yield* server.readFile({ path: "Inbox.md", startLine: 0 }).pipe(Effect.flip)

      assert.ok(error instanceof ReadFileRangeError)
      assert.match(error.message, /greater than or equal to 1/)
    }).pipe(Effect.provide(mcpServerLayer))
  )

  it.effect("registers Phase 1 MCP resources and tool", () =>
    Effect.gen(function* () {
      const client = yield* makeTestClient
      yield* client.initialize({
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "TestClient", version: "1.0.0" }
      })

      const resources = yield* client["resources/list"](undefined)
      const resourceTemplates = yield* client["resources/templates/list"](undefined)
      const tools = yield* client["tools/list"](undefined)

      assert.deepStrictEqual(
        resources.resources.map((resource) => resource.uri),
        ["kb://vault/index"]
      )
      assert.deepStrictEqual(
        resourceTemplates.resourceTemplates.map((resource) => resource.uriTemplate),
        ["kb://vault/file/{encodedPath}"]
      )
      assert.deepStrictEqual(
        tools.tools.map((tool) => tool.name),
        ["vault_read_file"]
      )
      assert.deepStrictEqual(tools.tools[0]?.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      })
      const successfulCall = yield* client["tools/call"]({
        name: "vault_read_file",
        arguments: { path: "Inbox.md", startLine: 2, endLine: 2 }
      })
      assert.deepStrictEqual(successfulCall.structuredContent, {
        path: "Inbox.md",
        contents: "second line",
        startLine: 2,
        endLine: 2,
        totalLines: 3
      })

      const invalidCall = yield* client["tools/call"]({
        name: "vault_read_file",
        arguments: { path: "Inbox.md", startLine: 0 }
      })
      assert.strictEqual(invalidCall.isError, true)
      assert.match(invalidCall.content[0]?.type === "text" ? invalidCall.content[0].text : "", /ToolParameterValidationError/)
    })
  )
})

const markdownEntries = (filesByPath: Readonly<Record<string, string>>): ReadonlyArray<readonly [string, string]> =>
  Object.entries(filesByPath).filter(([path]) => path.endsWith(".md"))
