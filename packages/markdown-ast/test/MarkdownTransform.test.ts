import { strict as assert } from "node:assert"
import { Effect, Option } from "effect"
import { describe, it } from "vitest"

import * as Markdown from "../src"

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

const makeTree = (): Markdown.Root => ({
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
})

const expectSome = (node: Option.Option<Markdown.AnyNode>): Markdown.AnyNode => {
  assert.equal(Option.isSome(node), true)
  if (Option.isSome(node)) {
    return node.value
  }
  assert.fail("expected some")
}

describe("Markdown transforms", () => {
  it("returns the same root for an identity map", () => {
    const tree = makeTree()

    const result = Markdown.map(tree, (cursor) => cursor.node)

    assert.equal(result, tree)
  })

  it("rebuilds only the changed ancestor chain when mapping a leaf", () => {
    const tree = makeTree()
    const firstParagraph = tree.children[0]
    const secondParagraph = tree.children[1]
    assert.ok(firstParagraph)
    assert.ok(secondParagraph)
    assert.equal(firstParagraph._tag, "ParagraphNode")
    const alpha = firstParagraph.children[0]
    const strong = firstParagraph.children[1]

    const result = Markdown.map(tree, (cursor) => {
      if (cursor.node._tag === "TextNode" && cursor.node.value === "alpha") {
        return { ...cursor.node, value: "ALPHA" }
      }
      return cursor.node
    }) as Markdown.Root

    assert.notEqual(result, tree)
    assert.notEqual(result.children[0], firstParagraph)
    assert.equal(result.children[1], secondParagraph)
    assert.equal((result.children[0] as Markdown.ParagraphNode).children[1], strong)
    assert.notEqual((result.children[0] as Markdown.ParagraphNode).children[0], alpha)
    assert.equal(((result.children[0] as Markdown.ParagraphNode).children[0] as Markdown.TextNode).value, "ALPHA")
  })

  it("maps children before invoking the parent mapper", () => {
    const tree = makeTree()
    let parentSawMappedChild = false

    const result = Markdown.map(tree, (cursor) => {
      if (cursor.node._tag === "TextNode" && cursor.node.value === "alpha") {
        return { ...cursor.node, value: "ALPHA" }
      }
      if (cursor.node._tag === "ParagraphNode" && cursor.index === 0) {
        parentSawMappedChild = cursor.node.children[0]?._tag === "TextNode" && cursor.node.children[0].value === "ALPHA"
      }
      return cursor.node
    }) as Markdown.Root

    assert.equal(parentSawMappedChild, true)
    assert.equal(((result.children[0] as Markdown.ParagraphNode).children[0] as Markdown.TextNode).value, "ALPHA")
  })

  it("filters out failed nodes and their subtrees", () => {
    const tree = makeTree()
    const seen: Array<string> = []

    const result = expectSome(
      Markdown.filter(tree, (cursor) => {
        if (cursor.node._tag === "TextNode") {
          seen.push(cursor.node.value)
        }
        return cursor.node._tag !== "StrongNode"
      })
    ) as Markdown.Root

    assert.deepEqual(seen, ["alpha", "charlie"])
    assert.deepEqual(
      (result.children[0] as Markdown.ParagraphNode).children.map((child) => child._tag),
      ["TextNode"]
    )

    const removedRoot = Markdown.filter(tree, (cursor) => cursor.node._tag !== "Root")
    assert.equal(Option.isNone(removedRoot), true)
  })

  it("removes matching nodes and preserves unrelated references", () => {
    const tree = makeTree()
    const firstParagraph = tree.children[0]
    const secondParagraph = tree.children[1]
    assert.ok(firstParagraph)
    assert.ok(secondParagraph)
    assert.equal(firstParagraph._tag, "ParagraphNode")
    const alpha = firstParagraph.children[0]

    const result = expectSome(Markdown.remove(tree, (cursor) => cursor.node._tag === "StrongNode")) as Markdown.Root

    assert.notEqual(result, tree)
    assert.notEqual(result.children[0], firstParagraph)
    assert.equal(result.children[1], secondParagraph)
    assert.deepEqual(
      (result.children[0] as Markdown.ParagraphNode).children.map((child) => child._tag),
      ["TextNode"]
    )
    assert.equal((result.children[0] as Markdown.ParagraphNode).children[0], alpha)
  })

  it("prunes a subtree and prevents descendant transformations", () => {
    const tree = makeTree()
    const firstParagraph = tree.children[0]
    const transformedText: Array<string> = []
    assert.ok(firstParagraph)

    const result = expectSome(
      Markdown.transform(tree, (cursor) => {
        if (cursor.node._tag === "ParagraphNode" && cursor.index === 0) {
          return Markdown.TransformControl.Prune({ node: cursor.node })
        }
        if (cursor.node._tag === "TextNode") {
          transformedText.push(cursor.node.value)
          return Markdown.TransformControl.Continue({ node: { ...cursor.node, value: cursor.node.value.toUpperCase() } })
        }
        return Markdown.TransformControl.Continue({ node: cursor.node })
      })
    ) as Markdown.Root

    assert.equal(result.children[0], firstParagraph)
    assert.deepEqual(transformedText, ["charlie"])
    assert.equal(((result.children[1] as Markdown.ParagraphNode).children[0] as Markdown.TextNode).value, "CHARLIE")
    assert.equal(((result.children[0] as Markdown.ParagraphNode).children[0] as Markdown.TextNode).value, "alpha")
  })

  it("provides effectful variants for mapping, filtering, removing, and transforming", () => {
    const mapped = Effect.runSync(
      Markdown.mapEffect(makeTree(), (cursor) =>
        Effect.succeed(
          cursor.node._tag === "TextNode" && cursor.node.value === "alpha"
            ? { ...cursor.node, value: "ALPHA" }
            : cursor.node
        )
      )
    ) as Markdown.Root
    assert.equal(((mapped.children[0] as Markdown.ParagraphNode).children[0] as Markdown.TextNode).value, "ALPHA")

    const filtered = expectSome(
      Effect.runSync(
        Markdown.filterEffect(makeTree(), (cursor) => Effect.succeed(cursor.node._tag !== "StrongNode"))
      )
    ) as Markdown.Root
    assert.deepEqual(
      (filtered.children[0] as Markdown.ParagraphNode).children.map((child) => child._tag),
      ["TextNode"]
    )

    const removed = expectSome(
      Effect.runSync(Markdown.removeEffect(makeTree(), (cursor) => Effect.succeed(cursor.node._tag === "StrongNode")))
    ) as Markdown.Root
    assert.deepEqual(
      (removed.children[0] as Markdown.ParagraphNode).children.map((child) => child._tag),
      ["TextNode"]
    )

    const transformed = expectSome(
      Effect.runSync(
        Markdown.transformEffect(makeTree(), (cursor) =>
          Effect.succeed(
            cursor.node._tag === "TextNode" && cursor.node.value === "charlie"
              ? Markdown.TransformControl.Continue({ node: { ...cursor.node, value: "CHARLIE" } })
              : Markdown.TransformControl.Continue({ node: cursor.node })
          )
        )
      )
    ) as Markdown.Root
    assert.equal(((transformed.children[1] as Markdown.ParagraphNode).children[0] as Markdown.TextNode).value, "CHARLIE")
  })
})
