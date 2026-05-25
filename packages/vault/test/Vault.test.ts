import { assert, describe, it } from "@effect/vitest"
import { Chunk, Effect, FileSystem, Layer, Path, Result, Trie } from "effect"
import { MarkdownFile } from "../src/markdown/MarkdownModel"
import * as Glob from "../src/Glob"
import { MarkdownParseError } from "../src/VaultErrors"
import { Vault } from "../src/Vault"
import { VaultService } from "../src/VaultService"
import { fromPath } from "../src/VaultScope"

const testRoot = "/effect-vault-test"
const toArray = <A>(chunk: Chunk.Chunk<A>): ReadonlyArray<A> => Chunk.toReadonlyArray(chunk)

type TestFileSystemState = {
  readonly files: Record<string, string>
  writes: number
  reads: number
}

const escapeRegExp = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, "\\$&")

const globPatternToRegExp = (pattern: string): RegExp => {
  let source = "^"
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === "*" && pattern[index + 1] === "*" && pattern[index + 2] === "/") {
      source += "(?:.*/)?"
      index += 2
    } else if (character === "*" && pattern[index + 1] === "*") {
      source += ".*"
      index += 1
    } else if (character === "*") {
      source += "[^/]*"
    } else if (character === "?") {
      source += "[^/]"
    } else {
      source += escapeRegExp(character ?? "")
    }
  }
  return new RegExp(`${source}$`)
}

const testGlobLayer = (state: TestFileSystemState) =>
  Layer.succeed(Glob.Glob, {
    glob: (pattern, options) =>
      Effect.sync(() => {
        const patterns = typeof pattern === "string" ? [pattern] : Array.from(pattern)
        const matchers = patterns.map(globPatternToRegExp)
        const cwd = typeof options?.cwd === "string" ? options.cwd : testRoot
        const rootPrefix = `${cwd}/`
        return Object.keys(state.files)
          .filter((filePath) => filePath.startsWith(rootPrefix))
          .map((filePath) => filePath.slice(rootPrefix.length))
          .filter((filePath) => matchers.some((matcher) => matcher.test(filePath)))
      })
  })

const testFileSystemLayer = (state: TestFileSystemState) =>
  FileSystem.layerNoop({
    readDirectory: (path) =>
      Effect.sync(() =>
        Object.keys(state.files)
          .filter((filePath) => filePath.startsWith(`${path}/`))
          .map((filePath) => filePath.slice(path.length + 1))
      ),
    readFileString: (path) =>
      Effect.sync(() => {
        state.reads += 1
        return state.files[path] ?? ""
      }),
    writeFileString: (path, contents) =>
      Effect.sync(() => {
        state.writes += 1
        state.files[path] = contents
      })
  })

const vaultLayer = (state: TestFileSystemState) =>
  VaultService.makeLayer({ root: testRoot }).pipe(
    Layer.provide(Layer.mergeAll(testFileSystemLayer(state), testGlobLayer(state), Path.layer))
  )

describe("Vault", () => {
  it.effect("exposes cached AST-backed projections without catalog DTO materialization", () => {
    const state: TestFileSystemState = {
      files: {
        [`${testRoot}/Notes/Search.md`]: [
          "---",
          "status: active",
          "---",
          "# Quarterly Review #meeting",
          "- [ ] Follow Ledger #task [project:: Finance] [area:: [[Work]]]",
          "See [[Runbook]] and [[Finance]]",
          "```dataview",
          'TASK FROM "Notes"',
          "```"
        ].join("\n"),
        [`${testRoot}/Notes/Runbook.md`]: "# Incident Guide #ops"
      },
      writes: 0,
      reads: 0
    }

    return Effect.gen(function* () {
      const vaultService = yield* VaultService
      const vault = yield* vaultService.scoped(fromPath("Notes"))
      const notes = toArray(yield* vault.notes())
      const frontmatter = toArray(yield* vault.frontmatter())
      const headings = toArray(yield* vault.headings())
      const links = toArray(yield* vault.links())
      const tags = toArray(yield* vault.tags())
      const tasks = toArray(yield* vault.tasks())
      const fencedBlocks = toArray(yield* vault.fencedBlocks())
      const finance = toArray(yield* vault.search(fromPath("Notes"), "finance"))

      assert.deepStrictEqual(
        notes.map((note) => note.path),
        ["Notes/Runbook.md", "Notes/Search.md"]
      )
      assert.deepStrictEqual(
        frontmatter.map((record) => [record.path, record.value]),
        [["Notes/Search.md", "status: active"]]
      )
      assert.deepStrictEqual(
        headings.map((heading) => [heading.path, heading.text]),
        [
          ["Notes/Runbook.md", "Incident Guide #ops"],
          ["Notes/Search.md", "Quarterly Review #meeting"]
        ]
      )
      assert.deepStrictEqual(
        links.map((link) => [link.path, link.target]),
        [
          ["Notes/Search.md", "Work"],
          ["Notes/Search.md", "Runbook"],
          ["Notes/Search.md", "Finance"],
          ["Notes/Search.md", "Work"],
          ["Notes/Search.md", "Runbook"],
          ["Notes/Search.md", "Finance"],
          ["Notes/Search.md", "Runbook"],
          ["Notes/Search.md", "Finance"]
        ]
      )
      assert.deepStrictEqual(
        tags.map((tag) => [tag.path, tag.value]),
        [
          ["Notes/Runbook.md", "#ops"],
          ["Notes/Runbook.md", "#ops"],
          ["Notes/Search.md", "#meeting"],
          ["Notes/Search.md", "#meeting"],
          ["Notes/Search.md", "#task"],
          ["Notes/Search.md", "#task"],
          ["Notes/Search.md", "#task"]
        ]
      )
      assert.deepStrictEqual(
        tasks.map((task) => [task.path, task.text, task.task.project, task.task.area]),
        [["Notes/Search.md", "Follow Ledger", "Finance", "[[Work]]"]]
      )
      assert.deepStrictEqual(
        fencedBlocks.map((block) => [block.path, block.language, block.value]),
        [["Notes/Search.md", "dataview", 'TASK FROM "Notes"']]
      )
      assert.deepStrictEqual(
        finance.map((result) => [result._tag, result.path, result.text]),
        [
          ["Link", "Notes/Search.md", "Finance"],
          ["Link", "Notes/Search.md", "Finance"],
          ["Link", "Notes/Search.md", "Finance"]
        ]
      )
      assert.strictEqual(state.writes, 0)
    }).pipe(Effect.provide(vaultLayer(state)))
  })
  it.effect("reuses cached projection inputs across repeated scoped facades", () => {
    const state: TestFileSystemState = {
      files: {
        [`${testRoot}/Notes/Tasks.md`]: "# Tasks\n- [ ] Keep cached #task"
      },
      writes: 0,
      reads: 0
    }

    return Effect.gen(function* () {
      const vaultService = yield* VaultService
      const firstVault = yield* vaultService.scoped(fromPath("Notes"))
      const firstTasks = toArray(yield* firstVault.tasks())
      const readsAfterFirstProjection = state.reads

      const secondVault = yield* vaultService.scoped(fromPath("Notes"))
      const secondTasks = toArray(yield* secondVault.tasks())

      assert.deepStrictEqual(
        firstTasks.map((task) => [task.path, task.text]),
        [["Notes/Tasks.md", "Keep cached"]]
      )
      assert.deepStrictEqual(
        secondTasks.map((task) => [task.path, task.text]),
        [["Notes/Tasks.md", "Keep cached"]]
      )
      assert.strictEqual(readsAfterFirstProjection, 1)
      assert.strictEqual(state.reads, readsAfterFirstProjection)
    }).pipe(Effect.provide(vaultLayer(state)))
  })

  it.effect("keeps good file projections available with parse diagnostics", () => {
    const goodFile = new MarkdownFile({
      path: "Notes/Good.md",
      contents: "# Good Note",
      mdast: {
        type: "root",
        children: [{ type: "heading", depth: 1, children: [{ type: "text", value: "Good Note" }] }]
      }
    })
    const parseFailure = new MarkdownParseError({ message: "bad markdown", input: "!!!" })
    const vaultService = VaultService.of({
      readText: () => Effect.succeed(""),
      writeText: () => Effect.void,
      readMarkdown: () => Effect.succeed(goodFile),
      readMarkdownTree: () =>
        Effect.succeed({
          root: "",
          files: Trie.fromIterable<Result.Result<MarkdownFile, MarkdownParseError>>([
            ["Notes/Bad.md", Result.fail(parseFailure) as Result.Result<MarkdownFile, MarkdownParseError>] as const,
            ["Notes/Good.md", Result.succeed(goodFile) as Result.Result<MarkdownFile, MarkdownParseError>] as const
          ])
        }),
      scoped: (scope) => Effect.flatMap(vaultService.readMarkdownTree(scope), (tree) => Vault.make({ scope, tree }))
    })

    return Effect.gen(function* () {
      const vault = yield* vaultService.scoped(fromPath("Notes"))
      const notes = toArray(yield* vault.notes())
      const headings = toArray(yield* vault.headings())
      const diagnostics = toArray(yield* vault.diagnostics())

      assert.deepStrictEqual(
        notes.map((note) => note.path),
        ["Notes/Good.md"]
      )
      assert.deepStrictEqual(
        headings.map((heading) => [heading.path, heading.text]),
        [["Notes/Good.md", "Good Note"]]
      )
      assert.deepStrictEqual(
        diagnostics.map((diagnostic) => [diagnostic.path, diagnostic.message]),
        [["Notes/Bad.md", "bad markdown"]]
      )
    })
  })
})
