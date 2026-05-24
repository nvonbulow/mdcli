import { assert, describe, it } from "@effect/vitest"
import type { Root } from "mdast"
import { Chunk, Effect } from "effect"
import { Markdown } from "../src/markdown/Markdown"
import { MarkdownParser } from "../src/markdown/MarkdownParser"

const parserLayer = MarkdownParser.layer

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
      const root = file.mdast as Root

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

      const frontmatter = Chunk.toReadonlyArray(Markdown.getFrontmatter(file))

      assert.strictEqual(frontmatter.length, 1)
      assert.strictEqual(frontmatter[0]?.language, "yaml")
      assert.strictEqual(frontmatter[0]?.value, "title: Vault\nstatus: active")
      assert.strictEqual(frontmatter[0]?.span?.start, 0)
      assert.ok((frontmatter[0]?.span?.end ?? 0) > frontmatter[0]!.value.length)
    }).pipe(Effect.provide(parserLayer))
  )

  it.effect("derives headings, wikilinks, tags, list items, tasks, inline fields, and fenced blocks", () =>
    Effect.gen(function* () {
      const file = yield* Markdown.parse(markdown)
      const headings = Chunk.toReadonlyArray(Markdown.getHeadings(file))
      const wikilinks = Chunk.toReadonlyArray(Markdown.getWikilinks(file))
      const tags = Chunk.toReadonlyArray(Markdown.getTags(file))
      const listItems = Chunk.toReadonlyArray(Markdown.getListItems(file))
      const tasks = Chunk.toReadonlyArray(Markdown.getTasks(file))
      const fields = Chunk.toReadonlyArray(Markdown.getInlineFields(file))
      const blocks = Chunk.toReadonlyArray(Markdown.getFencedBlocks(file))

      assert.strictEqual(headings.length, 1)
      assert.strictEqual(headings[0]?.depth, 1)
      assert.strictEqual(headings[0]?.text, "Project Home page #top")

      assert.strictEqual(wikilinks.length, 2)
      assert.strictEqual(wikilinks[0]?.target, "Home")
      assert.strictEqual(wikilinks[0]?.heading, "Overview")
      assert.strictEqual(wikilinks[0]?.alias, "Home page")
      assert.strictEqual(wikilinks[0]?.original, "[[Home#Overview|Home page]]")
      assert.strictEqual(wikilinks[1]?.block, "block-id")

      assert.deepStrictEqual(
        tags.map((tag) => tag.value),
        ["#top", "#note", "#task", "#done", "#plain"]
      )

      assert.strictEqual(listItems.length, 3)
      assert.strictEqual(listItems[0]?.checked, false)
      assert.strictEqual(listItems[0]?.text, "Task body #task 2026-05-24 TaskNote")
      assert.strictEqual(listItems[1]?.checked, true)
      assert.strictEqual(listItems[2]?.checked, undefined)
      assert.strictEqual(listItems[2]?.text, "Plain list item #plain")

      assert.strictEqual(tasks.length, 2)
      const firstTaskFields = Chunk.toReadonlyArray(tasks[0]!.fields)
      const firstTaskTags = Chunk.toReadonlyArray(tasks[0]!.tags)
      const secondTaskFields = Chunk.toReadonlyArray(tasks[1]!.fields)
      const secondTaskTags = Chunk.toReadonlyArray(tasks[1]!.tags)
      assert.strictEqual(tasks[0]?.done, false)
      assert.strictEqual(firstTaskFields[0]?.key, "due")
      assert.strictEqual(firstTaskFields[0]?.value, "2026-05-24")
      assert.deepStrictEqual(
        firstTaskTags.map((tag) => tag.value),
        ["#task"]
      )
      assert.strictEqual(tasks[1]?.done, true)
      assert.strictEqual(secondTaskFields[0]?.key, "completed")
      assert.deepStrictEqual(
        secondTaskTags.map((tag) => tag.value),
        ["#done"]
      )

      assert.deepStrictEqual(
        fields.map((field) => [field.key, field.value]),
        [
          ["field", "value"],
          ["due", "2026-05-24"],
          ["completed", "2026-05-24"]
        ]
      )

      assert.strictEqual(blocks.length, 2)
      assert.strictEqual(blocks[0]?.language, "dataview")
      assert.strictEqual(blocks[0]?.value, "TABLE file.name")
      assert.strictEqual(blocks[1]?.language, "text")
      assert.strictEqual(blocks[1]?.value, "#ignored-code")
    }).pipe(Effect.provide(parserLayer))
  )
})
