import { assert, describe, it } from "@effect/vitest"
import { Chunk, Effect, FileSystem, Layer, Path, Result, Trie } from "effect"
import { CatalogService } from "../src/CatalogService"
import { MarkdownFile } from "../src/markdown/MarkdownModel"
import { MarkdownParseError } from "../src/VaultErrors"
import { VaultService } from "../src/VaultService"
const testRoot = "/effect-catalog-test"
const toArray = <A>(chunk: Chunk.Chunk<A>): ReadonlyArray<A> => Chunk.toReadonlyArray(chunk)

type TestFiles = Record<string, string>

type TestFileSystemState = {
  readonly files: TestFiles
  writes: number
}

const testFileSystemLayer = (state: TestFileSystemState) =>
  FileSystem.layerNoop({
    readDirectory: (path) =>
      Effect.sync(() =>
        Object.keys(state.files)
          .filter((filePath) => filePath.startsWith(`${path}/`))
          .map((filePath) => filePath.slice(path.length + 1))
      ),
    readFileString: (path) => Effect.sync(() => state.files[path] ?? ""),
    writeFileString: (path, contents) =>
      Effect.sync(() => {
        state.writes += 1
        state.files[path] = contents
      })
  })

const vaultLayer = (state: TestFileSystemState) =>
  VaultService.makeLayer({ root: testRoot }).pipe(Layer.provide(Layer.mergeAll(testFileSystemLayer(state), Path.layer)))

const catalogLayer = (state: TestFileSystemState) => CatalogService.layer.pipe(Layer.provide(vaultLayer(state)))

describe("CatalogService", () => {
  it.effect(
    "builds deterministic multi-file snapshots with note, path, folder, frontmatter, heading, link, tag, list item, task, and fenced block records",
    () => {
      const state: TestFileSystemState = {
        files: {
          [`${testRoot}/30-Projects/Work/Zeta.md`]: [
            "---",
            "status: active",
            "---",
            "# Zeta Plan [[Alpha#Intro|Alpha intro]] #plan",
            "- [ ] Ship catalog #task [scheduled:: 2026-05-24] [area:: Work]",
            "- Reference item #reference",
            "```dataview",
            "TASK FROM #task",
            "```"
          ].join("\n"),
          [`${testRoot}/30-Projects/Work/Alpha.md`]: [
            "# Alpha Intro #alpha",
            "- [x] Close loop #task [completed:: 2026-05-23]",
            "",
            "  See [[Zeta]] and #crosslink"
          ].join("\n"),
          [`${testRoot}/30-Projects/Work/Ignore.txt`]: "# ignored"
        },
        writes: 0
      }

      return Effect.gen(function* () {
        const catalog = yield* CatalogService
        const snapshot = yield* catalog.snapshot("30-Projects/Work")
        const notes = toArray(snapshot.notes)
        const diagnostics = toArray(snapshot.diagnostics)
        const frontmatter = toArray(snapshot.frontmatter)
        const headings = toArray(snapshot.headings)
        const links = toArray(snapshot.links)
        const tags = toArray(snapshot.tags)
        const listItems = toArray(snapshot.listItems)
        const tasks = toArray(snapshot.tasks)
        const fencedBlocks = toArray(snapshot.fencedBlocks)

        assert.deepStrictEqual(
          notes.map((note) => note.path),
          ["30-Projects/Work/Alpha.md", "30-Projects/Work/Zeta.md"]
        )
        assert.deepStrictEqual(
          notes.map((note) => note.folder),
          ["30-Projects/Work", "30-Projects/Work"]
        )
        assert.deepStrictEqual(
          notes.map((note) => note.title),
          ["Alpha", "Zeta"]
        )
        assert.strictEqual(diagnostics.length, 0)

        assert.strictEqual(frontmatter.length, 1)
        assert.strictEqual(frontmatter[0]?.path, "30-Projects/Work/Zeta.md")
        assert.strictEqual(frontmatter[0]?.language, "yaml")
        assert.strictEqual(frontmatter[0]?.value, "status: active")
        assert.ok((frontmatter[0]?.span?.end ?? 0) > 0)

        assert.deepStrictEqual(
          headings.map((heading) => [heading.path, heading.depth, heading.text]),
          [
            ["30-Projects/Work/Alpha.md", 1, "Alpha Intro #alpha"],
            ["30-Projects/Work/Zeta.md", 1, "Zeta Plan Alpha intro #plan"]
          ]
        )
        assert.deepStrictEqual(
          links.map((link) => [link.path, link.target, link.alias, link.heading]),
          [
            ["30-Projects/Work/Alpha.md", "Zeta", undefined, undefined],
            ["30-Projects/Work/Zeta.md", "Alpha", "Alpha intro", "Intro"]
          ]
        )
        assert.deepStrictEqual(
          tags.map((tag) => [tag.path, tag.value]),
          [
            ["30-Projects/Work/Alpha.md", "#alpha"],
            ["30-Projects/Work/Alpha.md", "#task"],
            ["30-Projects/Work/Alpha.md", "#crosslink"],
            ["30-Projects/Work/Zeta.md", "#plan"],
            ["30-Projects/Work/Zeta.md", "#task"],
            ["30-Projects/Work/Zeta.md", "#reference"]
          ]
        )
        assert.deepStrictEqual(
          listItems.map((item) => [item.path, item.checked, item.text]),
          [
            ["30-Projects/Work/Alpha.md", true, "Close loop #task 2026-05-23"],
            ["30-Projects/Work/Zeta.md", false, "Ship catalog #task 2026-05-24 Work"],
            ["30-Projects/Work/Zeta.md", undefined, "Reference item #reference"]
          ]
        )
        assert.deepStrictEqual(
          tasks.map((task) => [task.path, task.title, task.text, task.done, task.lineNumber]),
          [
            ["30-Projects/Work/Alpha.md", "Alpha", "Close loop", true, 2],
            ["30-Projects/Work/Zeta.md", "Zeta", "Ship catalog", false, 5]
          ]
        )
        assert.deepStrictEqual(
          tasks.map((task) => task.task.source.path),
          ["30-Projects/Work/Alpha.md", "30-Projects/Work/Zeta.md"]
        )
        assert.deepStrictEqual(
          tasks.map((task) => toArray(task.tags)),
          [["#task"], ["#task"]]
        )
        assert.strictEqual(tasks[1]?.fields.scheduled, "2026-05-24")
        assert.strictEqual(tasks[1]?.fields.area, "Work")
        assert.strictEqual(fencedBlocks[0]?.path, "30-Projects/Work/Zeta.md")
        assert.strictEqual(fencedBlocks[0]?.language, "dataview")
        assert.strictEqual(fencedBlocks[0]?.value, "TASK FROM #task")
        assert.strictEqual(state.writes, 0)
      }).pipe(Effect.provide(catalogLayer(state)))
    }
  )

  it.effect("keeps good files cataloged when another tree entry contains a parse failure diagnostic", () => {
    const goodFile = new MarkdownFile({
      path: "Notes/Good.md",
      contents: "# Good Note #keep",
      mdast: {
        type: "root",
        children: [
          {
            type: "heading",
            depth: 1,
            children: [{ type: "text", value: "Good Note #keep" }]
          }
        ]
      }
    })
    const parseFailure = new MarkdownParseError({ message: "bad markdown", input: "!!!" })
    const vault = VaultService.of({
      readText: () => Effect.succeed(""),
      writeText: () => Effect.void,
      readMarkdown: () => Effect.succeed(goodFile),
      readMarkdownTree: (source) =>
        Effect.succeed({
          root: source,
          files: Trie.fromIterable<Result.Result<MarkdownFile, MarkdownParseError>>([
            ["Notes/Bad.md", Result.fail(parseFailure) as Result.Result<MarkdownFile, MarkdownParseError>] as const,
            ["Notes/Good.md", Result.succeed(goodFile) as Result.Result<MarkdownFile, MarkdownParseError>] as const
          ])
        })
    })
    const layer = CatalogService.layer.pipe(Layer.provide(Layer.succeed(VaultService, vault)))

    return Effect.gen(function* () {
      const catalog = yield* CatalogService
      const snapshot = yield* catalog.snapshot("Notes")
      const notes = toArray(snapshot.notes)
      const headings = toArray(snapshot.headings)
      const tags = toArray(snapshot.tags)
      const diagnostics = toArray(snapshot.diagnostics)

      assert.deepStrictEqual(
        notes.map((note) => note.path),
        ["Notes/Good.md"]
      )
      assert.deepStrictEqual(
        headings.map((heading) => [heading.path, heading.text]),
        [["Notes/Good.md", "Good Note #keep"]]
      )
      assert.deepStrictEqual(
        tags.map((tag) => [tag.path, tag.value]),
        [["Notes/Good.md", "#keep"]]
      )
      assert.strictEqual(diagnostics.length, 1)
      assert.strictEqual(diagnostics[0]?.path, "Notes/Bad.md")
      assert.strictEqual(diagnostics[0]?.folder, "Notes")
      assert.strictEqual(diagnostics[0]?.title, "Bad")
      assert.strictEqual(diagnostics[0]?.message, "bad markdown")
      assert.strictEqual(diagnostics[0]?.cause, parseFailure)
    }).pipe(Effect.provide(layer))
  })

  it.effect("lists records and searches path, title, task text, headings, links, and tags case-insensitively", () => {
    const state: TestFileSystemState = {
      files: {
        [`${testRoot}/Notes/Search.md`]: [
          "# Quarterly Review #meeting",
          "- [ ] Follow Ledger #task [project:: Finance]",
          "See [[Runbook]] and [[Finance]]"
        ].join("\n"),
        [`${testRoot}/Notes/Runbook.md`]: "# Incident Guide #ops"
      },
      writes: 0
    }

    return Effect.gen(function* () {
      const catalog = yield* CatalogService
      const notes = toArray(yield* catalog.listNotes("Notes"))
      const tasks = toArray(yield* catalog.listTasks("Notes"))
      const tags = toArray(yield* catalog.listTags("Notes"))
      const finance = toArray(yield* catalog.search("Notes", "finance"))
      const quarterly = toArray(yield* catalog.search("Notes", "QUARTERLY"))
      const runbook = toArray(yield* catalog.search("Notes", "runbook"))
      const follow = toArray(yield* catalog.search("Notes", "follow"))
      const meeting = toArray(yield* catalog.search("Notes", "meeting"))
      const notesPath = toArray(yield* catalog.search("Notes", "Search.md"))

      assert.deepStrictEqual(
        notes.map((note) => note.title),
        ["Runbook", "Search"]
      )
      assert.deepStrictEqual(
        tasks.map((task) => task.text),
        ["Follow Ledger"]
      )
      assert.deepStrictEqual(
        tags.map((tag) => tag.value),
        ["#ops", "#meeting", "#task"]
      )
      assert.deepStrictEqual(
        finance.map((result) => [result._tag.toLowerCase(), result.path, result.text]),
        [["link", "Notes/Search.md", "Finance"]]
      )
      assert.deepStrictEqual(
        quarterly.map((result) => result._tag.toLowerCase()),
        ["heading"]
      )
      assert.deepStrictEqual(
        follow.map((result) => result._tag.toLowerCase()),
        ["task"]
      )
      assert.deepStrictEqual(
        runbook.map((result) => result._tag.toLowerCase()),
        ["note", "link"]
      )
      assert.deepStrictEqual(
        meeting.map((result) => result._tag.toLowerCase()),
        ["heading", "tag"]
      )
      assert.deepStrictEqual(
        notesPath.map((result) => result._tag.toLowerCase()),
        ["note"]
      )
      assert.strictEqual(Object.hasOwn(catalog, "watch"), false)
      assert.strictEqual(Object.hasOwn(catalog, "write"), false)
      assert.strictEqual(state.writes, 0)
    }).pipe(Effect.provide(catalogLayer(state)))
  })
})
