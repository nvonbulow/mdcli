import { strict as assert } from "node:assert"
import { Effect, Option, Schema } from "effect"
import { describe, it } from "vitest"

import * as Markdown from "../src"

const processor = Markdown.MarkdownProcessor.make()

const parse = (source: string): Markdown.Root => Effect.runSync(processor.parse(source))

const encode = (root: Markdown.Root): unknown => Effect.runSync(Schema.encodeEffect(Markdown.Root)(root))

describe("Markdown Schema codecs", () => {
  it("decodes mdast roots and children into tagged nodes with mdast type fields", () => {
    const root = parse("# Title\n\nalpha **bravo**\n")

    assert.equal(root._tag, "Root")
    assert.equal(root.type, "root")

    const heading = root.children[0]
    assert.ok(heading)
    assert.equal(heading._tag, "HeadingNode")
    assert.equal(heading.type, "heading")

    const paragraph = root.children[1]
    assert.ok(paragraph)
    assert.equal(paragraph._tag, "ParagraphNode")
    assert.equal(paragraph.type, "paragraph")

    const strong = Array.from(Markdown.findAll(root, ({ node }) => node._tag === "StrongNode"), ({ node }) => node)[0]
    assert.ok(strong)
    assert.equal(strong.type, "strong")
  })

  it("decodes nullish optional fields while preserving null values inside table alignments", () => {
    const root = Effect.runSync(
      Schema.decodeUnknownEffect(Markdown.Root)({
        type: "root",
        children: [
          { type: "link", url: "https://example.com", title: undefined, children: [{ type: "text", value: "example" }] },
          { type: "image", url: "image.png", alt: null, title: null },
          { type: "table", align: undefined, children: [] },
          { type: "table", align: [null, "right"], children: [] }
        ]
      })
    )

    const link = root.children[0]
    const image = root.children[1]
    const tableWithoutAlign = root.children[2]
    const tableWithAlign = root.children[3]

    assert.ok(link)
    assert.equal(link._tag, "LinkNode")
    assert.equal(Option.isNone(link.title), true)

    assert.ok(image)
    assert.equal(image._tag, "ImageNode")
    assert.equal(Option.isNone(image.alt), true)
    assert.equal(Option.isNone(image.title), true)

    assert.ok(tableWithoutAlign)
    assert.equal(tableWithoutAlign._tag, "TableNode")
    assert.equal(Option.isNone(tableWithoutAlign.align), true)

    assert.ok(tableWithAlign)
    assert.equal(tableWithAlign._tag, "TableNode")
    assert.equal(Option.isSome(tableWithAlign.align), true)
    if (Option.isSome(tableWithAlign.align)) {
      assert.deepEqual(tableWithAlign.align.value, [null, "right"])
    }
  })

  it("encodes tagged nodes without _tag and preserves table alignment nulls", () => {
    const root = parse("| Name | Count |\n| --- | ---: |\n| Alpha | 1 |\n")
    const encoded = encode(root) as { readonly type: string; readonly children: ReadonlyArray<unknown>; readonly _tag?: string }
    const table = encoded.children[0] as { readonly align?: ReadonlyArray<string | null>; readonly _tag?: string }

    assert.equal("_tag" in encoded, false)
    assert.equal(encoded.type, "root")
    assert.equal("_tag" in table, false)
    assert.deepEqual(table.align, [null, "right"])
  })

  it("round-trips decode to encode through the default processor", () => {
    const root = parse("- [ ] Task [[Target]]\n")

    assert.equal(Effect.runSync(processor.stringify(root)), "- [ ] Task [[Target]]\n")
  })
})
