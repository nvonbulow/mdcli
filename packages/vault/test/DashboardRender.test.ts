import { assert, describe, it } from "@effect/vitest"
import { Chunk, Effect, FileSystem, Layer, Option, Path, Result, Trie } from "effect"
import { listItemText } from "@kb/markdown-ast"
import * as Markdown from "../src/markdown/Markdown"
import * as Glob from "../src/Glob"
import { VaultService } from "../src/VaultService"
import { fromPath } from "../src/VaultScope"

const testRoot = "/effect-vault-test"

type TestFiles = Record<string, string>

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

const testGlobLayer = (files: TestFiles) =>
  Layer.succeed(Glob.Glob, {
    glob: (pattern, options) =>
      Effect.sync(() => {
        const patterns = typeof pattern === "string" ? [pattern] : Array.from(pattern)
        const matchers = patterns.map(globPatternToRegExp)
        const cwd = typeof options?.cwd === "string" ? options.cwd : testRoot
        const rootPrefix = `${cwd}/`
        return Object.keys(files)
          .filter((filePath) => filePath.startsWith(rootPrefix))
          .map((filePath) => filePath.slice(rootPrefix.length))
          .filter((filePath) => matchers.some((matcher) => matcher.test(filePath)))
      })
  })

const testFileSystemLayer = (files: TestFiles) =>
  FileSystem.layerNoop({
    readDirectory: (path) =>
      Effect.sync(() =>
        Object.keys(files)
          .filter((filePath) => filePath.startsWith(`${path}/`))
          .map((filePath) => filePath.slice(path.length + 1))
      ),
    readFileString: (path) => Effect.sync(() => files[path] ?? ""),
    writeFileString: (path, contents) =>
      Effect.sync(() => {
        files[path] = contents
      })
  })

const vaultLayer = (files: TestFiles) =>
  VaultService.makeLayer({ root: testRoot }).pipe(
    Layer.provide(Layer.mergeAll(testFileSystemLayer(files), testGlobLayer(files), Path.layer))
  )

describe("VaultService", () => {
  it.effect("reads and writes text using paths relative to the configured root", () => {
    const files: TestFiles = {
      [`${testRoot}/Inbox.md`]: "# Inbox"
    }

    return Effect.gen(function* () {
      const vault = yield* VaultService

      assert.strictEqual(yield* vault.readText("Inbox.md"), "# Inbox")
      yield* vault.writeText("Inbox.md", "# Updated")

      assert.strictEqual(files[`${testRoot}/Inbox.md`], "# Updated")
      assert.strictEqual(files["Inbox.md"], undefined)
    }).pipe(Effect.provide(vaultLayer(files)))
  })

  it.effect("reads markdown files with relative source paths", () => {
    const files: TestFiles = {
      [`${testRoot}/30-Projects/Work/Roadmap.md`]: "# Roadmap",
      [`${testRoot}/30-Projects/Personal/Notes.txt`]: "not markdown",
      [`${testRoot}/30-Projects/Personal/Plan.md`]: "# Plan"
    }

    return Effect.gen(function* () {
      const vault = yield* VaultService
      const markdownFiles = yield* vault.readMarkdownFiles(fromPath("30-Projects"))
      const entries = Array.from(Trie.entries(markdownFiles))
      const files = entries.map(([, result]) => Result.getOrThrow(result))

      assert.deepStrictEqual(
        entries.map(([path]) => path),
        ["30-Projects/Personal/Plan.md", "30-Projects/Work/Roadmap.md"]
      )
      assert.deepStrictEqual(
        files.map((file) => file.path),
        ["30-Projects/Personal/Plan.md", "30-Projects/Work/Roadmap.md"]
      )
      assert.deepStrictEqual(
        files.map((file) => file.contents),
        ["# Plan", "# Roadmap"]
      )
    }).pipe(Effect.provide(vaultLayer(files)))
  })

  it.effect("invalidates parsed markdown cache after writing text", () => {
    const files: TestFiles = {
      [`${testRoot}/Inbox.md`]: "# Inbox\n- [ ] Old task #task"
    }

    return Effect.gen(function* () {
      const vault = yield* VaultService
      const first = yield* vault.readMarkdown("Inbox.md")

      assert.strictEqual(first.path, "Inbox.md")
      assert.strictEqual(first.contents, "# Inbox\n- [ ] Old task #task")
      const firstListItems = Chunk.toReadonlyArray(Markdown.listItems(first))
      assert.deepStrictEqual(
        firstListItems.map((item) => listItemText(item)),
        ["Old task #task"]
      )
      assert.deepStrictEqual(
        firstListItems.map((item) => optionValue(item.checked)),
        [false]
      )

      yield* vault.writeText("Inbox.md", "# Inbox\n- [x] New task #task")
      const second = yield* vault.readMarkdown("Inbox.md")

      assert.strictEqual(second.path, "Inbox.md")
      assert.strictEqual(second.contents, "# Inbox\n- [x] New task #task")
      const secondListItems = Chunk.toReadonlyArray(Markdown.listItems(second))
      assert.deepStrictEqual(
        secondListItems.map((item) => listItemText(item)),
        ["New task #task"]
      )
      assert.deepStrictEqual(
        secondListItems.map((item) => optionValue(item.checked)),
        [true]
      )
    }).pipe(Effect.provide(vaultLayer(files)))
  })
})

const optionValue = <Value>(option: Option.Option<Value>): Value | undefined =>
  Option.isSome(option) ? option.value : undefined
