import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { VaultService } from "../src/VaultService"

const testRoot = "/effect-vault-test"

type TestFiles = Record<string, string>

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
  VaultService.makeLayer({ root: testRoot }).pipe(Layer.provide(Layer.mergeAll(testFileSystemLayer(files), Path.layer)))

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

  it.effect("reads markdown trees with relative source paths", () => {
    const files: TestFiles = {
      [`${testRoot}/30-Projects/Personal/Plan.md`]: "# Plan",
      [`${testRoot}/30-Projects/Personal/Notes.txt`]: "not markdown",
      [`${testRoot}/30-Projects/Work/Roadmap.md`]: "# Roadmap"
    }

    return Effect.gen(function* () {
      const vault = yield* VaultService
      const markdownFiles = yield* vault.readMarkdownTree("30-Projects")

      assert.deepStrictEqual(
        markdownFiles.map((file) => file.path),
        ["30-Projects/Personal/Plan.md", "30-Projects/Work/Roadmap.md"]
      )
      assert.deepStrictEqual(
        markdownFiles.map((file) => file.contents),
        ["# Plan", "# Roadmap"]
      )
    }).pipe(Effect.provide(vaultLayer(files)))
  })

  it.effect("reads tasks from markdown under a relative source tree", () => {
    const files: TestFiles = {
      [`${testRoot}/30-Projects/Personal/Plan.md`]: [
        "- [ ] Plan groceries #task [scheduled:: 2026-05-23] [area:: [[Personal]]] [project:: [[Meal Planning]]]",
        "- [ ] Plain checkbox"
      ].join("\n"),
      [`${testRoot}/30-Projects/Work/Roadmap.md`]:
        "- [x] Ship migration #task [completed:: 2026-05-24] [area:: [[Work]]] [project:: [[Vault]]]",
      [`${testRoot}/30-Projects/Work/Notes.txt`]: "- [ ] Not markdown #task"
    }

    return Effect.gen(function* () {
      const vault = yield* VaultService
      const tasks = yield* vault.readTasks("30-Projects")

      assert.deepStrictEqual(
        tasks.map((task) => task.text),
        ["Plan groceries", "Ship migration"]
      )
      assert.deepStrictEqual(
        tasks.map((task) => task.source.path),
        ["30-Projects/Personal/Plan.md", "30-Projects/Work/Roadmap.md"]
      )
      assert.deepStrictEqual(
        tasks.map((task) => task.source.lineNumber),
        [1, 1]
      )
    }).pipe(Effect.provide(vaultLayer(files)))
  })
})
