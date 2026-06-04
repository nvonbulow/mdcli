import { strict as assert } from "node:assert"
import { Effect, Option } from "effect"
import { describe, it } from "vitest"

import * as Markdown from "../src"

const processor = Markdown.MarkdownProcessor.make()

const decode = (source: string): Markdown.Root => Effect.runSync(processor.parse(source))

const stringify = (root: Markdown.Root): string => Effect.runSync(processor.stringify(root))

const expectSome = (node: Option.Option<Markdown.AnyNode>): Markdown.AnyNode => {
  assert.equal(Option.isSome(node), true)
  if (Option.isSome(node)) {
    return node.value
  }
  assert.fail("expected some")
}

describe("Markdown inline data fields", () => {
  it("decodes inline data fields with key and value child containers", () => {
    const root = decode("Task [due:: 2022-04-05] [area:: [[Ops]]]")
    const fields = Array.from(Markdown.inlineDataFields(root))

    assert.equal(fields.length, 2)
    assert.equal(fields[0]?._tag, "InlineDataFieldNode")
    assert.equal(fields[0]?.delimiter, "square")
    assert.deepEqual(fields[0]?.children.map((child) => child._tag), ["InlineDataFieldKeyNode", "InlineDataFieldValueNode"])
    assert.equal(Markdown.inlineDataFieldKeyText(fields[0]!), "due")
    assert.equal(Markdown.inlineDataFieldValueText(fields[0]!), "2022-04-05")

    const areaValue = Markdown.inlineDataFieldValue(fields[1]!)
    assert.deepEqual(areaValue.children.map((child) => child._tag), ["WikilinkNode"])
    assert.equal((areaValue.children[0] as Markdown.WikilinkNode).target, "Ops")
  })

  it("stringifies inline data fields, nested wikilinks, and block anchors", () => {
    const source = "- [ ] Send mail [due:: 2022-04-05] [area:: [[Ops]]] ^send-mail"
    const root = decode(source)

    assert.equal(stringify(root), `${source}\n`)
  })

  it("exposes inline data field and block anchor query helpers", () => {
    const root = decode("# Task [area:: [[Ops]]]\n\n^task-anchor")
    const fields = Array.from(Markdown.inlineDataFieldsWithKey("area")(root))
    const anchors = Array.from(Markdown.blockAnchors(root))
    const heading = Array.from(Markdown.findAll(root, ({ node }) => node._tag === "HeadingNode"), ({ node }) => node as Markdown.HeadingNode)[0]

    assert.equal(fields.length, 1)
    assert.equal(Markdown.inlineDataFieldValueText(fields[0]!), "Ops")
    assert.equal(anchors.length, 1)
    assert.equal(anchors[0]?.id, "task-anchor")
    assert.ok(heading)
    assert.equal(Markdown.headingText(heading), "Task Ops")
  })

  it("walk reaches inline data field containers and nested wikilinks", () => {
    const root = decode("[area:: [[Ops]]]")

    assert.deepEqual(
      Array.from(Markdown.walk(root), (cursor) => cursor.node._tag),
      [
        "Root",
        "ParagraphNode",
        "InlineDataFieldNode",
        "InlineDataFieldKeyNode",
        "TextNode",
        "InlineDataFieldValueNode",
        "WikilinkNode"
      ]
    )
  })

  it("map and filter traverse inline data field child containers", () => {
    const root = decode("[area:: [[Ops]]]")
    const mapped = Markdown.map(root, ({ node }) => {
      if (node._tag === "WikilinkNode") {
        return { ...node, target: "Operations", value: "Operations", original: "[[Operations]]" }
      }
      return node
    }) as Markdown.Root
    const mappedLink = Array.from(Markdown.wikilinks(mapped))[0]

    assert.equal(mappedLink?.target, "Operations")
    assert.equal(stringify(mapped), "[area:: [[Operations]]]\n")

    const filtered = expectSome(Markdown.filter(root, ({ node }) => node._tag !== "WikilinkNode")) as Markdown.Root
    const field = Array.from(Markdown.inlineDataFields(filtered))[0]

    assert.ok(field)
    assert.deepEqual(Markdown.inlineDataFieldValue(field).children, [])
  })

  it("renames wikilinks inside inline data field values", () => {
    const root = decode("[area:: [[Ops]]]")
    const renamed = Markdown.renameWikilinkTarget(root, "Ops", "Operations") as Markdown.Root
    const link = Array.from(Markdown.wikilinks(renamed))[0]

    assert.equal(link?.target, "Operations")
    assert.equal(stringify(renamed), "[area:: [[Operations]]]\n")
  })
})
