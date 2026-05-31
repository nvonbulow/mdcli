import { strict as assert } from "node:assert"
import { Effect, Option, Schema } from "effect"
import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { unified } from "unified"
import { describe, it } from "vitest"
import { remarkWikilinks } from "@kb/remark-wikilinks"

import * as Markdown from "../src/markdown"

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkWikilinks)
  .use(remarkStringify, Markdown.markdownStringifyOptions)

const parse = (source: string): Root => processor.runSync(processor.parse(source)) as Root

const decode = (source: string): Markdown.Root =>
  Effect.runSync(Schema.decodeUnknownEffect(Markdown.Root)(parse(source)))

const stringify = (root: Markdown.Root): string => {
  const encoded = Schema.encodeSync(Markdown.Root)(root)
  return processor.stringify(encoded as Root)
}

const optionValue = <Value>(option: Option.Option<Value>): Value | undefined =>
  Option.isSome(option) ? option.value : undefined

describe("Markdown wikilinks", () => {
  it("decodes wikilink and blockAnchor nodes and stringifies them back", () => {
    const source = "[[Target#Header|Alias]] [[#^block-id]] [[Target#^block|Block Alias]] ![[Target]] ^block-id"
    const root = decode(source)
    const wikilinks = Array.from(
      Markdown.findAll(root, ({ node }) => node._tag === "WikilinkNode"),
      ({ node }) => node as Markdown.WikilinkNode
    )
    const anchors = Array.from(
      Markdown.findAll(root, ({ node }) => node._tag === "BlockAnchorNode"),
      ({ node }) => node as Markdown.BlockAnchorNode
    )

    assert.equal(wikilinks.length, 4)
    assert.equal(wikilinks[0]?.target, "Target")
    assert.equal(optionValue(wikilinks[0]?.header ?? Option.none()), "Header")
    assert.equal(optionValue(wikilinks[0]?.alias ?? Option.none()), "Alias")
    assert.equal(wikilinks[0]?.value, "Alias")

    assert.equal(wikilinks[1]?.target, "")
    assert.equal(optionValue(wikilinks[1]?.block ?? Option.none()), "block-id")
    assert.equal(wikilinks[1]?.value, "block-id")

    assert.equal(wikilinks[2]?.target, "Target")
    assert.equal(optionValue(wikilinks[2]?.block ?? Option.none()), "block")
    assert.equal(optionValue(wikilinks[2]?.alias ?? Option.none()), "Block Alias")

    assert.equal(wikilinks[3]?.target, "Target")
    assert.equal(optionValue(wikilinks[3]?.embed ?? Option.none()), true)

    assert.equal(anchors.length, 1)
    assert.equal(anchors[0]?.id, "block-id")
    assert.equal(anchors[0]?.value, "block-id")
    assert.equal(anchors[0]?.original, "^block-id")

    assert.equal(stringify(root), `${source}\n`)
  })

  it("uses vault markdown list markers and preserves Obsidian inline field brackets", () => {
    const source = "- [x] Task [scheduled:: 2026-05-23] [depends:: [[Target#^block-id]]]\n  - Child [area:: [[Personal]]]"
    const root = decode(source)

    assert.equal(
      stringify(root),
      "- [x] Task [scheduled:: 2026-05-23] [depends:: [[Target#^block-id]]]\n  - Child [area:: [[Personal]]]\n"
    )
  })
})
