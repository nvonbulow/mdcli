import { assert, describe, it } from "@effect/vitest"
import { Chunk, Effect, FileSystem, Layer, Path, Result, Trie } from "effect"
import { MarkdownFile } from "../src/markdown/MarkdownModel"
import * as Glob from "../src/Glob"
import { MarkdownParseError } from "@kb/markdown-ast"
import { Vault } from "../src/Vault"
import { VaultService } from "../src/VaultService"
import { fromPath, type VaultScope } from "../src/VaultScope"
import { search } from "../src/VaultSearch"
import { sourceExcerpt, sourceLine } from "../src/VaultSource"
import {
  diagnostics,
  fencedBlocks,
  filterVault,
  frontmatter,
  headings,
  links,
  listItems,
  notes,
  tags
} from "../src/VaultProjections"

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
      const searchFile = filterVault(vault, fromPath("Notes/Search.md"))
      const noteRecords = toArray(notes(vault))
      const frontmatterRecords = toArray(frontmatter(vault))
      const headingRecords = toArray(headings(vault))
      const linkRecords = toArray(links(vault))
      const tagRecords = toArray(tags(vault))
      const listItemRecords = toArray(listItems(searchFile))
      const fencedBlockRecords = toArray(fencedBlocks(searchFile))
      const finance = toArray(search(filterVault(vault, fromPath("Notes")), "finance"))

      assert.deepStrictEqual(
        noteRecords.map((note) => note.path),
        ["Notes/Runbook.md", "Notes/Search.md"]
      )
      assert.deepStrictEqual(
        frontmatterRecords.map((record) => [record.path, record.value]),
        [["Notes/Search.md", { status: "active" }]]
      )
      assert.deepStrictEqual(
        headingRecords.map((heading) => [heading.path, heading.text]),
        [
          ["Notes/Runbook.md", "Incident Guide #ops"],
          ["Notes/Search.md", "Quarterly Review #meeting"]
        ]
      )
      assert.deepStrictEqual(
        linkRecords.map((link) => [link.path, link.target]),
        [
          ["Notes/Search.md", "Work"],
          ["Notes/Search.md", "Runbook"],
          ["Notes/Search.md", "Finance"]
        ]
      )
      assert.deepStrictEqual(
        tagRecords.map((tag) => [tag.path, tag.value]),
        [
          ["Notes/Runbook.md", "#ops"],
          ["Notes/Search.md", "#meeting"],
          ["Notes/Search.md", "#task"]
        ]
      )
      assert.deepStrictEqual(
        listItemRecords.map((item) => [item.path, item.text, item.checked]),
        [["Notes/Search.md", "Follow Ledger #task Finance Work", false]]
      )
      assert.deepStrictEqual(
        fencedBlockRecords.map((block) => [block.path, block.language, block.value]),
        [["Notes/Search.md", "dataview", 'TASK FROM "Notes"']]
      )
      assert.deepStrictEqual(
        finance.map((result) => [result._tag, result.path, result.text]),
        [["Link", "Notes/Search.md", "Finance"]]
      )
      assert.strictEqual(sourceLine(vault, "Notes/Search.md", 4), "# Quarterly Review #meeting")
      assert.strictEqual(sourceExcerpt(vault, "Notes/Search.md", headingRecords[1]?.position), "# Quarterly Review #meeting")
      assert.strictEqual(state.writes, 0)
    }).pipe(Effect.provide(vaultLayer(state)))
  })

  it.effect("excludes .kbignore matches from projections and search", () => {
    const state: TestFileSystemState = {
      files: {
        [`${testRoot}/.kbignore`]: ["# Intentional repository instruction file", "AGENTS.md"].join("\n"),
        [`${testRoot}/AGENTS.md`]: "# Vault agent instructions #agent",
        [`${testRoot}/Notes/Kept.md`]: "# Kept Note #kept\nSee [[AGENTS]]."
      },
      writes: 0,
      reads: 0
    }

    return Effect.gen(function* () {
      const vaultService = yield* VaultService
      const vault = yield* vaultService.scoped(fromPath("."))

      const noteRecords = toArray(notes(vault))
      const headingRecords = toArray(headings(vault))
      const ignoredContentResults = toArray(search(vault, "instructions"))
      const keptResults = toArray(search(vault, "kept"))

      assert.deepStrictEqual(
        noteRecords.map((note) => note.path),
        ["Notes/Kept.md"]
      )
      assert.deepStrictEqual(
        headingRecords.map((heading) => [heading.path, heading.text]),
        [["Notes/Kept.md", "Kept Note #kept"]]
      )
      assert.deepStrictEqual(
        ignoredContentResults.map((result) => [result._tag, result.path, result.text]),
        []
      )
      assert.deepStrictEqual(
        keptResults.map((result) => [result._tag, result.path, result.text]),
        [
          ["Note", "Notes/Kept.md", "Kept"],
          ["Heading", "Notes/Kept.md", "Kept Note #kept"],
          ["Tag", "Notes/Kept.md", "#kept"]
        ]
      )
    }).pipe(Effect.provide(vaultLayer(state)))
  })

  it.effect("reuses cached projection inputs across repeated scoped facades", () => {
    const state: TestFileSystemState = {
      files: {
        [`${testRoot}/Notes/List.md`]: "# List\n- [ ] Keep cached #item"
      },
      writes: 0,
      reads: 0
    }

    return Effect.gen(function* () {
      const vaultService = yield* VaultService
      const firstVault = yield* vaultService.scoped(fromPath("Notes"))
      const firstListItems = toArray(listItems(firstVault))
      const readsAfterFirstProjection = state.reads

      const secondVault = yield* vaultService.scoped(fromPath("Notes"))
      const secondListItems = toArray(listItems(secondVault))

      assert.deepStrictEqual(
        firstListItems.map((item) => [item.path, item.text]),
        [["Notes/List.md", "Keep cached #item"]]
      )
      assert.deepStrictEqual(
        secondListItems.map((item) => [item.path, item.text]),
        [["Notes/List.md", "Keep cached #item"]]
      )
      assert.strictEqual(readsAfterFirstProjection, 2)
      assert.strictEqual(state.reads, readsAfterFirstProjection)
    }).pipe(Effect.provide(vaultLayer(state)))
  })

  it.effect("keeps good file projections available with parse diagnostics", () => {
    const goodFile = new MarkdownFile({
      path: "Notes/Good.md",
      contents: "# Good Note",
      mdast: {
        _tag: "Root",
        type: "root",
        children: [
          {
            _tag: "HeadingNode",
            type: "heading",
            depth: 1,
            children: [{ _tag: "TextNode", type: "text", value: "Good Note" }]
          }
        ]
      }
    })
    const parseFailure = new MarkdownParseError({ message: "bad markdown", input: "!!!" })
    const files = Trie.fromIterable<Result.Result<MarkdownFile, MarkdownParseError>>([
      ["Notes/Bad.md", Result.fail(parseFailure) as Result.Result<MarkdownFile, MarkdownParseError>] as const,
      ["Notes/Good.md", Result.succeed(goodFile) as Result.Result<MarkdownFile, MarkdownParseError>] as const
    ])
    const vaultService = VaultService.of({
      readText: () => Effect.succeed(""),
      writeText: () => Effect.void,
      readMarkdown: () => Effect.succeed(goodFile),
      readMarkdownFiles: () => Effect.succeed(files),
      scoped: (scope: VaultScope) => Effect.flatMap(vaultService.readMarkdownFiles(scope), (files) => Vault.make({ scope, files }))
    } as unknown as VaultService)

    return Effect.gen(function* () {
      const vault = yield* vaultService.scoped(fromPath("Notes"))
      const noteRecords = toArray(notes(vault))
      const headingRecords = toArray(headings(vault))
      const diagnosticRecords = toArray(diagnostics(vault))

      assert.deepStrictEqual(
        noteRecords.map((note) => note.path),
        ["Notes/Good.md"]
      )
      assert.deepStrictEqual(
        headingRecords.map((heading) => [heading.path, heading.text]),
        [["Notes/Good.md", "Good Note"]]
      )
      assert.deepStrictEqual(
        diagnosticRecords.map((diagnostic) => [diagnostic.path, diagnostic.message]),
        [["Notes/Bad.md", "bad markdown"]]
      )
    })
  })
})
