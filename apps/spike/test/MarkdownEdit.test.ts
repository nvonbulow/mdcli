import { strict as assert } from "node:assert"
import { Effect, Option, Schema } from "effect"
import type { Root } from "mdast"
import { remarkWikilinks } from "@kb/remark-wikilinks"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { unified } from "unified"
import { describe, it } from "vitest"

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

describe("Markdown edit helpers", () => {
  it("renames every wikilink with the matching target", () => {
    const root = decode("[[Personal]] [[Work]] [[Personal#Plan]]")
    const renamed = Markdown.renameWikilinkTarget(root, "Personal", "Life") as Markdown.Root
    const links = Array.from(Markdown.wikilinks(renamed))

    assert.deepEqual(
      links.map((link) => link.target),
      ["Life", "Work", "Life"]
    )
    assert.equal(stringify(renamed), "[[Life]] [[Work]] [[Life#Plan]]\n")
  })

  it("preserves identity when no matching wikilink is changed", () => {
    const root = decode("Before [[Other]] after")
    const link = Array.from(Markdown.wikilinks(root))[0]
    const renamed = Markdown.renameWikilinkTarget(root, "Personal", "Life") as Markdown.Root

    assert.equal(renamed, root)
    assert.equal(Array.from(Markdown.wikilinks(renamed))[0], link)
  })

  it("keeps alias display values while updating target and original", () => {
    const root = decode("[[Personal|Me]]")
    const renamed = Markdown.renameWikilinkTarget(root, "Personal", "Life") as Markdown.Root
    const link = Array.from(Markdown.wikilinks(renamed))[0]

    assert.ok(link)
    assert.equal(link.target, "Life")
    assert.equal(link.value, "Me")
    assert.equal(link.original, "[[Life|Me]]")
    assert.equal(stringify(renamed), "[[Life|Me]]\n")
  })

  it("preserves header, block, and embed fields and serializes them", () => {
    const root = decode("![[Personal#Header]] [[Personal#^block-id]]")
    const renamed = Markdown.renameWikilinkTarget(root, "Personal", "Life") as Markdown.Root
    const links = Array.from(Markdown.wikilinks(renamed))

    assert.equal(links[0]?.target, "Life")
    assert.equal(optionValue(links[0]?.header ?? Option.none()), "Header")
    assert.equal(optionValue(links[0]?.embed ?? Option.none()), true)
    assert.equal(links[0]?.original, "![[Life#Header]]")
    assert.equal(links[1]?.target, "Life")
    assert.equal(optionValue(links[1]?.block ?? Option.none()), "block-id")
    assert.equal(links[1]?.original, "[[Life#^block-id]]")
    assert.equal(stringify(renamed), "![[Life#Header]] [[Life#^block-id]]\n")
  })

  it("returns the original root when from and to are the same", () => {
    const root = decode("[[Personal]]")

    assert.equal(Markdown.renameWikilinkTarget(root, "Personal", "Personal"), root)
  })
})
