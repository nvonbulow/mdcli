import { strict as assert } from "node:assert"
import { Effect, Option } from "effect"
import { describe, it } from "vitest"

import * as Markdown from "../src"

const processor = Markdown.MarkdownProcessor.make()

const decode = (source: string): Markdown.Root => Effect.runSync(processor.parse(source))

describe("Markdown vault projection helpers", () => {
  it("queries headings, list items, fenced blocks, and readable list item text", () => {
    const root = decode("# Heading\n\n- [ ] Ship [[Target|Alias]] [area:: [[Ops]]] ^ship\n  - nested\n\n```dataview\nTASK\n```")

    const headings = Array.from(Markdown.headings(root))
    const listItems = Array.from(Markdown.listItems(root))
    const fencedBlocks = Array.from(Markdown.fencedBlocks(root))

    assert.equal(headings.length, 1)
    assert.equal(Markdown.nodeText(headings[0]!), "Heading")
    assert.equal(listItems.length, 2)
    assert.equal(Markdown.listItemText(listItems[0]!), "Ship Alias Ops ")
    assert.equal(fencedBlocks.length, 1)
    assert.equal(fencedBlocks[0] !== undefined && Option.isSome(fencedBlocks[0].lang) ? fencedBlocks[0].lang.value : undefined, "dataview")
    assert.equal(fencedBlocks[0]?.value, "TASK")
  })

  it("extracts markdown tags with exact positions outside ignored regions", () => {
    const root = decode("# Heading #area/work\n\nBefore #task `#inline` [[#not-tag]] [field:: #not-tag]\n\n```md\n#not-tag\n```")
    const tags = Array.from(Markdown.tags(root))

    assert.deepEqual(
      tags.map((tag) => tag.value),
      ["#area/work", "#task"]
    )
    assert.deepEqual(tags[0]?.position, {
      start: { line: 1, column: 11, offset: 10 },
      end: { line: 1, column: 21, offset: 20 }
    })
    assert.deepEqual(tags[1]?.position, {
      start: { line: 3, column: 8, offset: 29 },
      end: { line: 3, column: 13, offset: 34 }
    })
  })

  it("preserves markdown syntax for inline data field values", () => {
    const root = decode("- [ ] Send [area:: [[Personal]]] [anchor:: [[Parent#^anchor]]] [plain:: value]")
    const fields = Array.from(Markdown.inlineDataFields(root))

    assert.deepEqual(
      fields.map(Markdown.inlineDataFieldValueMarkdown),
      ["[[Personal]]", "[[Parent#^anchor]]", "value"]
    )
  })
})
