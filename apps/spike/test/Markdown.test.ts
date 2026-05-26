import { strict as assert } from "node:assert"
import { remarkObsidian } from "@kb/remark-obsidian"
import type { Root } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { unified } from "unified"
import { describe, it } from "vitest"

import * as Markdown from "../src/markdown"

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkObsidian)
  .use(remarkStringify)

const parse = (source: string): Root => processor.runSync(processor.parse(source)) as Root

const findNode = (
  node: Markdown.MarkdownNode,
  predicate: (node: Markdown.MarkdownNode) => boolean
): Markdown.MarkdownNode | undefined => {
  if (predicate(node)) {
    return node
  }
  if (!Markdown.isParent(node)) {
    return undefined
  }
  for (const child of node.children) {
    const found = findNode(child, predicate)
    if (found !== undefined) {
      return found
    }
  }
  return undefined
}

describe("Markdown tagged data", () => {
  it("converts mdast roots and children into tagged nodes with mdast type fields", () => {
    const root = Markdown.fromMdast(parse("# Title\n\nalpha **bravo** [rating:: high]\n"))

    assert.equal(root._tag, "Root")
    assert.equal(root.type, "root")

    const heading = root.children[0]
    assert.ok(heading)
    assert.equal(heading._tag, "Heading")
    assert.equal(heading.type, "heading")

    const paragraph = root.children[1]
    assert.ok(paragraph)
    assert.equal(paragraph._tag, "Paragraph")
    assert.equal(paragraph.type, "paragraph")

    const strong = findNode(root, Markdown.MarkdownNode.$is("Strong"))
    assert.ok(strong)
    assert.equal(strong.type, "strong")
  })

  it("converts Obsidian inline fields while preserving their stringify type", () => {
    const root = Markdown.fromMdast(parse("alpha [rating:: high]\n"))
    const field = findNode(root, Markdown.MarkdownNode.$is("ObsidianInlineField"))

    assert.ok(field)
    assert.ok(Markdown.MarkdownNode.$is("ObsidianInlineField")(field))
    assert.equal(field._tag, "ObsidianInlineField")
    assert.equal(field.type, "obsidianInlineField")
    assert.equal(field.key, "rating")
    assert.equal(field.value, "high")
  })

  it("stringifies a tagged root directly and emits Obsidian inline fields", () => {
    const root = Markdown.MarkdownNode.Root({
      type: "root",
      children: [
        Markdown.MarkdownNode.Paragraph({
          type: "paragraph",
          children: [
            Markdown.MarkdownNode.Text({ type: "text", value: "Task " }),
            Markdown.MarkdownNode.ObsidianInlineField({
              type: "obsidianInlineField",
              key: "completed",
              value: "2026-05-26",
              original: "[completed:: 2026-05-26]",
              valueStart: 13,
              valueEnd: 23
            })
          ]
        })
      ]
    })

    assert.equal(processor.stringify(root as unknown as Root), "Task [completed:: 2026-05-26]\n")
  })
})
