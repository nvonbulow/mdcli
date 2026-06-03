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

  it("supports pure and effectful visitors", () => {
    const visited: string[] = []
    Markdown.visit(tree, (node) => {
      visited.push(node._tag)
    })

    assert.deepEqual(visited, ["Root", "ParagraphNode", "TextNode", "StrongNode", "TextNode", "ParagraphNode", "TextNode"])

    const visitedEffect: string[] = []
    Effect.runSync(
      Markdown.visitEffect(tree, (node) =>
        Effect.sync(() => {
          visitedEffect.push(node._tag)
        })
      )
    )

    assert.deepEqual(visitedEffect, visited)
  })

  it("supports pure and effectful controlled traversal decisions", () => {
    const skippedSeen: string[] = []

    Markdown.visitControlled(tree, (cursor) => {
      skippedSeen.push(cursor.node._tag)
      if (cursor.node._tag === "ParagraphNode" && cursor.index === 0) {
        return Markdown.VisitControl.SkipChildren()
      }
      return Markdown.VisitControl.Continue()
    })

    assert.deepEqual(skippedSeen, ["Root", "ParagraphNode", "ParagraphNode", "TextNode"])

    const stoppedSeen: string[] = []
    Effect.runSync(
      Markdown.visitControlledEffect(tree, (cursor) => {
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
    const found = Markdown.find(tree, (cursor) => cursor.node._tag === "StrongNode")

    assert.equal(Option.isSome(found), true)
    if (Option.isSome(found)) {
      assert.equal(found.value.node._tag, "StrongNode")
      assert.equal(found.value.parents.at(-1)?._tag, "ParagraphNode")
      assert.equal(found.value.index, 1)
    }

    assert.deepEqual(
      Array.from(Markdown.findAll(tree, (cursor) => cursor.node._tag === "ParagraphNode"), (cursor) => cursor.index),
      [0, 1]
    )

    const foundEffect = Effect.runSync(
      Markdown.findEffect(tree, (cursor) => Effect.succeed(cursor.node._tag === "StrongNode"))
    )
    assert.equal(Option.isSome(foundEffect), true)

    const foundAllEffect = Effect.runSync(
      Markdown.findAllEffect(tree, (cursor) => Effect.succeed(cursor.node._tag === "ParagraphNode"))
    )
    assert.deepEqual(
      foundAllEffect.map((cursor) => cursor.index),
      [0, 1]
    )
  })
})
