import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { CatalogService } from "../src/CatalogService"
import { MarkdownParser } from "../src/markdown/MarkdownParser"
import { VaultService } from "../src/VaultService"
import { MarkdownParseError } from "../src/VaultErrors"

const testRoot = "/effect-catalog-test"

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

const catalogLayer = (state: TestFileSystemState) =>
  CatalogService.layer.pipe(Layer.provide(Layer.mergeAll(vaultLayer(state), MarkdownParser.layer)))

const parserLayerFailingOnMarker = Layer.effect(
  MarkdownParser,
  Effect.gen(function* () {
    const liveParser = yield* MarkdownParser
    return MarkdownParser.of({
      parse: (markdown) =>
        markdown.includes("[[[fail-parse]]]")
          ? Effect.fail(new MarkdownParseError({ message: "marked parse failure", input: markdown }))
          : liveParser.parse(markdown)
    })
  })
).pipe(Layer.provide(MarkdownParser.layerNoDeps))

const catalogLayerWithParserFailure = (state: TestFileSystemState) =>
  CatalogService.layer.pipe(Layer.provide(Layer.mergeAll(vaultLayer(state), parserLayerFailingOnMarker)))

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

        assert.deepStrictEqual(
          snapshot.notes.map((note) => note.path),
          ["30-Projects/Work/Alpha.md", "30-Projects/Work/Zeta.md"]
        )
        assert.deepStrictEqual(
          snapshot.notes.map((note) => note.folder),
          ["30-Projects/Work", "30-Projects/Work"]
        )
        assert.deepStrictEqual(
          snapshot.notes.map((note) => note.title),
          ["Alpha", "Zeta"]
        )
        assert.strictEqual(snapshot.diagnostics.length, 0)

        assert.strictEqual(snapshot.frontmatter.length, 1)
        assert.strictEqual(snapshot.frontmatter[0]?.path, "30-Projects/Work/Zeta.md")
        assert.strictEqual(snapshot.frontmatter[0]?.language, "yaml")
        assert.strictEqual(snapshot.frontmatter[0]?.value, "status: active")
        assert.ok((snapshot.frontmatter[0]?.span?.end ?? 0) > 0)

        assert.deepStrictEqual(
          snapshot.headings.map((heading) => [heading.path, heading.depth, heading.text]),
          [
            ["30-Projects/Work/Alpha.md", 1, "Alpha Intro #alpha"],
            ["30-Projects/Work/Zeta.md", 1, "Zeta Plan Alpha intro #plan"]
          ]
        )
        assert.deepStrictEqual(
          snapshot.links.map((link) => [link.path, link.target, link.alias, link.heading]),
          [
            ["30-Projects/Work/Alpha.md", "Zeta", undefined, undefined],
            ["30-Projects/Work/Zeta.md", "Alpha", "Alpha intro", "Intro"]
          ]
        )
        assert.deepStrictEqual(
          snapshot.tags.map((tag) => [tag.path, tag.value]),
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
          snapshot.listItems.map((item) => [item.path, item.checked, item.text]),
          [
            ["30-Projects/Work/Alpha.md", true, "Close loop #task 2026-05-23"],
            ["30-Projects/Work/Zeta.md", false, "Ship catalog #task 2026-05-24 Work"],
            ["30-Projects/Work/Zeta.md", undefined, "Reference item #reference"]
          ]
        )
        assert.deepStrictEqual(
          snapshot.tasks.map((task) => [task.path, task.title, task.text, task.done, task.lineNumber]),
          [
            ["30-Projects/Work/Alpha.md", "Alpha", "Close loop", true, 2],
            ["30-Projects/Work/Zeta.md", "Zeta", "Ship catalog", false, 5]
          ]
        )
        assert.deepStrictEqual(
          snapshot.tasks.map((task) => task.task.source.path),
          ["30-Projects/Work/Alpha.md", "30-Projects/Work/Zeta.md"]
        )
        assert.deepStrictEqual(
          snapshot.tasks.map((task) => task.tags),
          [["#task"], ["#task"]]
        )
        assert.strictEqual(snapshot.tasks[1]?.fields.scheduled, "2026-05-24")
        assert.strictEqual(snapshot.tasks[1]?.fields.area, "Work")
        assert.strictEqual(snapshot.fencedBlocks[0]?.path, "30-Projects/Work/Zeta.md")
        assert.strictEqual(snapshot.fencedBlocks[0]?.language, "dataview")
        assert.strictEqual(snapshot.fencedBlocks[0]?.value, "TASK FROM #task")
        assert.strictEqual(state.writes, 0)
      }).pipe(Effect.provide(catalogLayer(state)))
    }
  )

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
      const notes = yield* catalog.listNotes("Notes")
      const tasks = yield* catalog.listTasks("Notes")
      const tags = yield* catalog.listTags("Notes")
      const finance = yield* catalog.search("Notes", "finance")
      const quarterly = yield* catalog.search("Notes", "QUARTERLY")
      const runbook = yield* catalog.search("Notes", "runbook")
      const follow = yield* catalog.search("Notes", "follow")
      const meeting = yield* catalog.search("Notes", "meeting")
      const notesPath = yield* catalog.search("Notes", "Search.md")

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
        finance.map((result) => [result.kind, result.path, result.text]),
        [["link", "Notes/Search.md", "Finance"]]
      )
      assert.deepStrictEqual(
        quarterly.map((result) => result.kind),
        ["heading"]
      )
      assert.deepStrictEqual(
        follow.map((result) => result.kind),
        ["task"]
      )
      assert.deepStrictEqual(
        runbook.map((result) => result.kind),
        ["note", "link"]
      )
      assert.deepStrictEqual(
        meeting.map((result) => result.kind),
        ["heading", "tag"]
      )
      assert.deepStrictEqual(
        notesPath.map((result) => result.kind),
        ["note"]
      )
      assert.strictEqual(Object.hasOwn(catalog, "watch"), false)
      assert.strictEqual(Object.hasOwn(catalog, "write"), false)
      assert.strictEqual(state.writes, 0)
    }).pipe(Effect.provide(catalogLayer(state)))
  })

  it.effect("keeps cataloging other files and records diagnostics when parsing fails", () => {
    const state: TestFileSystemState = {
      files: {
        [`${testRoot}/Mixed/Good.md`]: "# Good #ok\n- [ ] Keep working #task",
        [`${testRoot}/Mixed/Bad.md`]: "[[[fail-parse]]]"
      },
      writes: 0
    }

    return Effect.gen(function* () {
      const catalog = yield* CatalogService
      const snapshot = yield* catalog.snapshot("Mixed")

      assert.deepStrictEqual(
        snapshot.notes.map((note) => note.path),
        ["Mixed/Good.md"]
      )
      assert.deepStrictEqual(
        snapshot.tasks.map((task) => task.text),
        ["Keep working"]
      )
      assert.strictEqual(snapshot.diagnostics.length, 1)
      assert.strictEqual(snapshot.diagnostics[0]?.path, "Mixed/Bad.md")
      assert.strictEqual(snapshot.diagnostics[0]?.folder, "Mixed")
      assert.strictEqual(snapshot.diagnostics[0]?.title, "Bad")
      assert.strictEqual(snapshot.diagnostics[0]?.message, "marked parse failure")
      assert.strictEqual(state.writes, 0)
    }).pipe(Effect.provide(catalogLayerWithParserFailure(state)))
  })
})
