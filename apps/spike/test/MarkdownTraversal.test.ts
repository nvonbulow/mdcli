import { strict as assert } from "node:assert"
import { Effect, Option } from "effect"
import { describe, it } from "vitest"

import * as Markdown from "../src/markdown"
const position: Markdown.TextNode["position"] = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 }
}

const text = (value: string): Markdown.TextNode => ({
  _tag: "TextNode",
  type: "text",
  position,
  value
})

const tree: Markdown.Root = {
  _tag: "Root",
  type: "root",
  position,
  children: [
    {
      _tag: "ParagraphNode",
      type: "paragraph",
      position,
      children: [
        text("alpha"),
        {
          _tag: "StrongNode",
          type: "strong",
          position,
          children: [text("bravo")]
        }
      ]
    },
    {
      _tag: "ParagraphNode",
      type: "paragraph",
      position,
      children: [text("charlie")]
    }
  ]
}

describe("Markdown traversal", () => {
  it("walks markdown nodes lazily in pre-order with cursor context", () => {
    const cursors = Array.from(Markdown.walk(tree))

    assert.deepEqual(
      cursors.map((cursor) => cursor.node._tag),
      ["Root", "ParagraphNode", "TextNode", "StrongNode", "TextNode", "ParagraphNode", "TextNode"]
    )
    assert.equal(cursors[0]?.index, undefined)
    assert.equal(cursors[2]?.index, 0)
    assert.equal(cursors[2]?.parents.at(-1)?._tag, "ParagraphNode")
    assert.equal(cursors[3]?.index, 1)
    assert.equal(cursors[4]?.parents.map((parent) => parent._tag).join("/"), "Root/ParagraphNode/StrongNode")
  })

  it("supports controlled traversal decisions", () => {
    const skippedSeen: string[] = []

    Effect.runSync(
      Markdown.visitControlled(tree, (cursor) => {
        skippedSeen.push(cursor.node._tag)
        if (cursor.node._tag === "ParagraphNode" && cursor.index === 0) {
          return Effect.succeed(Markdown.VisitControl.SkipChildren())
        }
        return Effect.succeed(Markdown.VisitControl.Continue())
      })
    )

    assert.deepEqual(skippedSeen, ["Root", "ParagraphNode", "ParagraphNode", "TextNode"])

    const stoppedSeen: string[] = []
    Effect.runSync(
      Markdown.visitControlled(tree, (cursor) => {
        stoppedSeen.push(cursor.node._tag)
        if (cursor.node._tag === "StrongNode") {
          return Effect.succeed(Markdown.VisitControl.Stop())
        }
        return Effect.succeed(Markdown.VisitControl.Continue())
      })
    )

    assert.deepEqual(stoppedSeen, ["Root", "ParagraphNode", "TextNode", "StrongNode"])
  })

  it("finds the first matching cursor and collects all matching cursors", () => {
    const found = Effect.runSync(Markdown.find(tree, (cursor) => cursor.node._tag === "StrongNode"))

    assert.equal(Option.isSome(found), true)
    if (Option.isSome(found)) {
      assert.equal(found.value.node._tag, "StrongNode")
      assert.equal(found.value.parents.at(-1)?._tag, "ParagraphNode")
      assert.equal(found.value.index, 1)
    }

    assert.deepEqual(
      Markdown.findAll(tree, (cursor) => cursor.node._tag === "ParagraphNode").map((cursor) => cursor.index),
      [0, 1]
    )
  })
})
