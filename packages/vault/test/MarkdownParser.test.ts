import { assert, describe, it } from "@effect/vitest"
import { listItemText, nodeText, MarkdownProcessor } from "@kb/markdown-ast"
import { Chunk, Effect, Layer, Option } from "effect"
import * as Markdown from "../src/markdown/Markdown"
import { MarkdownParser } from "../src/markdown/MarkdownParser"

const parserLayer = Layer.mergeAll(MarkdownParser.layer, MarkdownProcessor.layer)

const markdown = [
  "---",
  "title: Vault",
  "status: active",
  "---",
  "# Project [[Home#Overview|Home page]] #top",
  "",
  "Paragraph #note with [field:: value] and `#ignored-inline`.",
  "",
  "- [ ] Task body #task [due:: 2026-05-24] [[TaskNote#^block-id]]",
  "- [x] Done task #done [completed:: 2026-05-24]",
  "- Plain list item #plain",
  "",
  "```dataview",
  "TABLE file.name",
  "```",
  "",
  "```text",
  "#ignored-code",
  "```"
].join("\n")

describe("MarkdownParser", () => {
  it.effect("preserves contents and mdast root", () =>
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      const file = yield* parser.parse(markdown)
      const root = file.mdast

      assert.strictEqual(file.contents, markdown)
      assert.strictEqual(root.type, "root")
      assert.ok(root.children.length > 0)
    }).pipe(Effect.provide(parserLayer))
  )

  it.effect("parses markdown text only without attaching a source path", () =>
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      const file = yield* Markdown.parse("# Title")

      assert.strictEqual(parser.parse.length, 1)
      assert.strictEqual(Object.hasOwn(file, "source"), false)
      assert.strictEqual(Object.hasOwn(file, "path"), false)
    }).pipe(Effect.provide(parserLayer))
  )

  it.effect("extracts YAML frontmatter from the AST", () =>
    Effect.gen(function* () {
      const file = yield* Markdown.parse(markdown)

      const frontmatter = Chunk.toReadonlyArray(Markdown.frontmatter(file))

      assert.strictEqual(frontmatter.length, 1)
      assert.deepStrictEqual(frontmatter[0]?.value, { title: "Vault", status: "active" })
      assert.strictEqual(frontmatter[0]?.position?.start.offset, 0)
      assert.ok(frontmatter[0]?.position?.end.offset !== undefined)
    }).pipe(Effect.provide(parserLayer))
  )

  it.effect("derives headings, wikilinks, tags, list items, tasks, inline fields, and fenced blocks", () =>
    Effect.gen(function* () {
      const file = yield* Markdown.parse(markdown)
      const headings = Chunk.toReadonlyArray(Markdown.headings(file))
      const wikilinks = Chunk.toReadonlyArray(Markdown.wikilinks(file))
      const tags = Chunk.toReadonlyArray(Markdown.tags(file))
      const listItems = Chunk.toReadonlyArray(Markdown.listItems(file))
      const tasks = Chunk.toReadonlyArray(Markdown.tasks(file))
      const blocks = Chunk.toReadonlyArray(Markdown.fencedBlocks(file))

      assert.strictEqual(headings.length, 1)
      assert.strictEqual(headings[0]?.depth, 1)
      assert.strictEqual(nodeText(headings[0]!), "Project Home page #top")

      assert.deepStrictEqual(
        wikilinks.map((link) => [link.target, optionValue(link.header), optionValue(link.alias), optionValue(link.block), link.original]),
        [
          ["Home", "Overview", "Home page", undefined, "[[Home#Overview|Home page]]"],
          ["TaskNote", undefined, undefined, "block-id", "[[TaskNote#^block-id]]"]
        ]
      )

      assert.deepStrictEqual(
        tags.map((tag) => tag.value),
        ["#top", "#note", "#task", "#done", "#plain"]
      )

      assert.strictEqual(listItems.length, 3)
      assert.strictEqual(optionValue(listItems[0]!.checked), false)
      assert.strictEqual(listItemText(listItems[0]!), "Task body #task 2026-05-24 TaskNote")
      assert.strictEqual(optionValue(listItems[1]!.checked), true)
      assert.strictEqual(optionValue(listItems[2]!.checked), undefined)
      assert.strictEqual(listItemText(listItems[2]!), "Plain list item #plain")

      assert.strictEqual(tasks.length, 2)

      assert.strictEqual(blocks.length, 2)
      assert.strictEqual(optionValue(blocks[0]!.lang), "dataview")
      assert.strictEqual(blocks[0]?.value, "TABLE file.name")
      assert.strictEqual(optionValue(blocks[1]!.lang), "text")
      assert.strictEqual(blocks[1]?.value, "#ignored-code")
    }).pipe(Effect.provide(parserLayer))
  )
})

const optionValue = <Value>(option: Option.Option<Value>): Value | undefined =>
  Option.isSome(option) ? option.value : undefined
