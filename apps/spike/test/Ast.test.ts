import { strict as assert } from "node:assert"
import { Effect } from "effect"
import type { Node, Parent, Position } from "unist"
import { describe, it } from "vitest"

import * as Ast from "../src/ast"

interface TextNode extends Node {
  readonly type: "text"
  readonly value: string
}

interface ParagraphNode extends Parent {
  readonly type: "paragraph"
  children: TextNode[]
}

interface RootNode extends Parent {
  readonly type: "root"
  children: Array<ParagraphNode | TextNode>
}

const position = (start: number, end: number, startColumn: number, endColumn: number): Position => ({
  start: { line: 1, column: startColumn, offset: start },
  end: { line: 1, column: endColumn, offset: end }
})

const text = (value: string, start = 0): TextNode => ({
  type: "text",
  value,
  position: position(start, start + value.length, start + 1, start + value.length + 1)
})

const tree = (): RootNode => ({
  type: "root",
  children: [
    {
      type: "paragraph",
      children: [text("alpha", 0), text("beta", 6)],
      position: position(0, 10, 1, 11)
    },
    text("loose", 12)
  ],
  position: position(0, 17, 1, 18)
})

describe("Ast helpers", () => {
  it("checks wrapped nodes by predicate or node type", () => {
    const ast = Ast.make(tree())

    assert.equal(Ast.is(ast, "root"), true)
    assert.equal(Ast.isNodeType(ast, "paragraph"), false)
    assert.equal(Ast.is((node) => node.node.type === "root")(ast), true)
  })

  it("visits immutable and mutable nodes synchronously with parents and child indexes", () => {
    const ast = Ast.make(tree())
    const immutableSeen: string[] = []

    Ast.visit(ast, (node, parents) => {
      immutableSeen.push(`${parents.map((parent) => parent.node.type).join(">")}:${node.node.type}`)
    })

    assert.deepEqual(immutableSeen, [":root", "root:paragraph", "root>paragraph:text", "root>paragraph:text", "root:text"])

    const mutableSeen: string[] = []
    Ast.mutate(ast, (mutable) => {
      Ast.visitMutable(mutable, (node, parents, index) => {
        mutableSeen.push(`${parents.map((parent) => parent.node.type).join(">")}:${node.node.type}:${index ?? "root"}`)
      })
    })

    assert.deepEqual(mutableSeen, [":root:root", "root:paragraph:0", "root>paragraph:text:0", "root>paragraph:text:1", "root:text:1"])
  })

  it("visits immutable and mutable nodes effectfully with parents and child indexes", () => {
    const ast = Ast.make(tree())
    const immutableSeen: string[] = []

    Effect.runSync(
      Ast.visitEffect(ast, (node, parents) => {
        immutableSeen.push(`${parents.map((parent) => parent.node.type).join(">")}:${node.node.type}`)
        return Effect.succeed(undefined)
      })
    )

    assert.deepEqual(immutableSeen, [":root", "root:paragraph", "root>paragraph:text", "root>paragraph:text", "root:text"])

    const mutableSeen: string[] = []
    Effect.runSync(
      Ast.mutateEffect(ast, (mutable) =>
        Ast.visitMutableEffect(mutable, (node, parents, index) => {
          mutableSeen.push(`${parents.map((parent) => parent.node.type).join(">")}:${node.node.type}:${index ?? "root"}`)
          return Effect.succeed(undefined)
        })
      )
    )

    assert.deepEqual(mutableSeen, [":root:root", "root:paragraph:0", "root>paragraph:text:0", "root>paragraph:text:1", "root:text:1"])

    const pipeableSeen: string[] = []
    Ast.visit((node) => {
      pipeableSeen.push(node.node.type)
    })(ast)
    assert.deepEqual(pipeableSeen, ["root", "paragraph", "text", "text", "text"])

    const pipeableEffectSeen: string[] = []
    Effect.runSync(
      Ast.visitEffect((node) => {
        pipeableEffectSeen.push(node.node.type)
        return Effect.succeed(undefined)
      })(ast)
    )
    assert.deepEqual(pipeableEffectSeen, ["root", "paragraph", "text", "text", "text"])
    const pipeableMutableEffectSeen: string[] = []
    Effect.runSync(
      Ast.mutateEffect(ast, (mutable) =>
        Ast.visitMutableEffect((node) => {
          pipeableMutableEffectSeen.push(node.node.type)
          return Effect.succeed(undefined)
        })(mutable)
      )
    )
    assert.deepEqual(pipeableMutableEffectSeen, ["root", "paragraph", "text", "text", "text"])
  })

  it("maps a copied tree without mutating the original", () => {
    const raw = tree()
    const mapped = Ast.map(Ast.make(raw), (node) => {
      if (node.node.type !== "text") {
        return node.node
      }

      const textNode = node.node as TextNode
      return { ...textNode, value: textNode.value.toUpperCase() }
    })

    const pipeableMapped = Ast.map((node) => {
      if (node.node.type !== "text") {
        return node.node
      }

      const textNode = node.node as TextNode
      return { ...textNode, value: `${textNode.value}!` }
    })(Ast.make(raw))

    assert.deepEqual(Ast.findAll(pipeableMapped, "text").map((node) => (node.node as TextNode).value), [
      "alpha!",
      "beta!",
      "loose!"
    ])

    const mappedTexts = Ast.findAll(mapped, "text").map((node) => (node.node as TextNode).value)

    assert.deepEqual(mappedTexts, ["ALPHA", "BETA", "LOOSE"])
    assert.equal(raw.children[0]?.type === "paragraph" ? raw.children[0].children[0]?.value : undefined, "alpha")
  })

  it("maps a copied tree effectfully without mutating the original", () => {
    const raw = tree()
    const mapped = Effect.runSync(
      Ast.mapEffect(Ast.make(raw), (node, parents, index) => {
        if (node.node.type !== "text") {
          return Effect.succeed(node.node)
        }

        const textNode = node.node as TextNode
        return Effect.succeed({
          ...textNode,
          value: `${parents.map((parent) => parent.node.type).join(">")}:${index ?? "root"}:${textNode.value.toUpperCase()}`
        })
      })
    )

    const mappedTexts = Ast.findAll(mapped, "text").map((node) => (node.node as TextNode).value)

    assert.deepEqual(mappedTexts, ["root>paragraph:0:ALPHA", "root>paragraph:1:BETA", "root:1:LOOSE"])
    assert.equal(raw.children[0]?.type === "paragraph" ? raw.children[0].children[0]?.value : undefined, "alpha")

    const pipeableMapped = Effect.runSync(
      Ast.mapEffect((node) => Effect.succeed(node.node))(Ast.make(raw))
    )

    assert.equal(pipeableMapped.node.type, "root")
  })

  it("filters and removes roots and children structurally", () => {
    const ast = Ast.make(tree())

    assert.equal(Ast.filter(ast, (node) => node.node.type !== "root"), undefined)
    assert.equal(Ast.remove(ast, (node) => node.node.type === "root"), undefined)

    const withoutText = Ast.remove(ast, (node) => node.node.type === "text")
    assert.ok(withoutText)
    assert.deepEqual(withoutText.node.children.map((child) => child.type), ["paragraph"])
    assert.deepEqual((withoutText.node.children[0] as ParagraphNode).children, [])

    const pipeableWithoutLoose = Ast.remove(
      (node) => node.node.type === "text" && (node.node as TextNode).value === "loose"
    )(ast)
    assert.ok(pipeableWithoutLoose)
    assert.deepEqual(pipeableWithoutLoose.node.children.map((child) => child.type), ["paragraph"])
    assert.deepEqual((pipeableWithoutLoose.node.children[0] as ParagraphNode).children.map((child) => child.value), [
      "alpha",
      "beta"
    ])

    const onlyRootAndParagraph = Ast.filter(ast, (node) => node.node.type === "root" || node.node.type === "paragraph")
    assert.ok(onlyRootAndParagraph)
    assert.deepEqual(onlyRootAndParagraph.node.children.map((child) => child.type), ["paragraph"])
    const pipeableOnlyNestedText = Ast.filter(
      (node, parents) =>
        node.node.type === "root" ||
        node.node.type === "paragraph" ||
        parents.map((parent) => parent.node.type).join(">") === "root>paragraph"
    )(ast)
    assert.ok(pipeableOnlyNestedText)
    assert.deepEqual(Ast.findAll(pipeableOnlyNestedText, "text").map((node) => (node.node as TextNode).value), [
      "alpha",
      "beta"
    ])
  })

  it("filters and removes roots and children effectfully", () => {
    const ast = Ast.make(tree())

    assert.equal(Effect.runSync(Ast.filterEffect(ast, (node) => Effect.succeed(node.node.type !== "root"))), undefined)
    assert.equal(Effect.runSync(Ast.removeEffect(ast, (node) => Effect.succeed(node.node.type === "root"))), undefined)

    const withoutText = Effect.runSync(Ast.removeEffect(ast, (node) => Effect.succeed(node.node.type === "text")))
    assert.ok(withoutText)
    assert.deepEqual(withoutText.node.children.map((child) => child.type), ["paragraph"])
    assert.deepEqual((withoutText.node.children[0] as ParagraphNode).children, [])
    const pipeableWithoutLoose = Effect.runSync(
      Ast.removeEffect((node) => Effect.succeed(node.node.type === "text" && (node.node as TextNode).value === "loose"))(ast)
    )
    assert.ok(pipeableWithoutLoose)
    assert.deepEqual(pipeableWithoutLoose.node.children.map((child) => child.type), ["paragraph"])

    const onlyRootAndParagraph = Effect.runSync(
      Ast.filterEffect((node) => Effect.succeed(node.node.type === "root" || node.node.type === "paragraph"))(ast)
    )
    assert.ok(onlyRootAndParagraph)
    assert.deepEqual(onlyRootAndParagraph.node.children.map((child) => child.type), ["paragraph"])
  })

  it("modifies children inside mutate without changing the original tree", () => {
    const raw = tree()
    const ast = Ast.make(raw)
    const modified = Ast.mutate(ast, (mutable) => {
      Ast.modifyChildren(mutable, (parent, children) =>
        parent.node.type === "root" ? [...children].reverse() : children
      )
    })

    assert.deepEqual(modified.node.children.map((child) => child.type), ["text", "paragraph"])
    assert.deepEqual(raw.children.map((child) => child.type), ["paragraph", "text"])

    const pipeableModified = Ast.mutate((mutable: Ast.MutableAst<RootNode>) => {
      Ast.modifyChildren((parent, children) =>
        parent.node.type === "paragraph" ? children.slice(0, 1) : children
      )(mutable)
    })(ast)

    assert.equal((pipeableModified.node.children[0] as ParagraphNode).children.length, 1)
  })

  it("modifies children effectfully inside mutateEffect without changing the original tree", () => {
    const raw = tree()
    const ast = Ast.make(raw)
    const modified = Effect.runSync(
      Ast.mutateEffect(ast, (mutable) =>
        Ast.modifyChildrenEffect(mutable, (parent, children) =>
          Effect.succeed(parent.node.type === "root" ? [...children].reverse() : children)
        )
      )
    )

    assert.deepEqual(modified.node.children.map((child) => child.type), ["text", "paragraph"])
    assert.deepEqual(raw.children.map((child) => child.type), ["paragraph", "text"])

    const pipeableModified = Effect.runSync(
      Ast.mutateEffect((mutable: Ast.MutableAst<RootNode>) =>
        Ast.modifyChildrenEffect((parent, children) =>
          Effect.succeed(parent.node.type === "paragraph" ? children.slice(0, 1) : children)
        )(mutable)
      )(ast)
    )

    assert.equal((pipeableModified.node.children[0] as ParagraphNode).children.length, 1)
  })

  it("finds nodes by string type and predicate", () => {
    const ast = Ast.make(tree())

    assert.equal(Ast.find(ast, "paragraph")?.node.type, "paragraph")
    assert.equal(Ast.findAll(ast, "text").length, 3)
    assert.equal(
      Ast.find(ast, (node, parents) => node.node.type === "text" && parents.map((parent) => parent.node.type).join(">") === "root>paragraph")
        ?.node.type,
      "text"
    )
  })

  it("finds nodes effectfully by string type and predicate", () => {
    const ast = Ast.make(tree())

    assert.equal(Effect.runSync(Ast.findEffect(ast, "paragraph"))?.node.type, "paragraph")
    assert.equal(Effect.runSync(Ast.findEffect("paragraph")(ast))?.node.type, "paragraph")
    assert.equal(Effect.runSync(Ast.findAllEffect(ast, "text")).length, 3)
    assert.equal(Effect.runSync(Ast.findAllEffect("text")(ast)).length, 3)

    const firstNestedText = Effect.runSync(
      Ast.findEffect(ast, (node, parents, index) =>
        Effect.succeed(
          node.node.type === "text" &&
            parents.map((parent) => parent.node.type).join(">") === "root>paragraph" &&
            index === 0
        )
      )
    )

    assert.equal(firstNestedText?.node.type, "text")
    assert.equal((firstNestedText?.node as TextNode | undefined)?.value, "alpha")
    const pipeableFirstNestedText = Effect.runSync(
      Ast.findEffect((node, parents) =>
        Effect.succeed(node.node.type === "text" && parents.map((parent) => parent.node.type).join(">") === "root>paragraph")
      )(ast)
    )

    assert.equal((pipeableFirstNestedText?.node as TextNode | undefined)?.value, "alpha")

    const nestedTexts = Effect.runSync(
      Ast.findAllEffect((node, parents) =>
        Effect.succeed(node.node.type === "text" && parents.map((parent) => parent.node.type).join(">") === "root>paragraph")
      )(ast)
    )

    assert.deepEqual(nestedTexts.map((node) => (node.node as TextNode).value), ["alpha", "beta"])
  })

  it("reports positions, locations, and source slices", () => {
    const ast = Ast.make(tree())
    const firstText = Ast.find(ast, "text")

    assert.ok(firstText)
    assert.deepEqual(Ast.position(firstText), position(0, 5, 1, 6))
    assert.equal(Ast.stringifyPosition(firstText), "1:1-1:6")
    assert.equal(Ast.location(firstText, "note.md"), "note.md:1:1-1:6")
    assert.equal(Ast.location("note.md")(firstText), "note.md:1:1-1:6")
    assert.equal(Ast.location(firstText), "1:1-1:6")
    assert.equal(Ast.source("alpha beta loose", firstText), "alpha")
    assert.equal(Ast.source("alpha beta loose")(firstText), "alpha")
    assert.equal(Ast.stringifyPosition({ type: "generated" }), "?:?")
    assert.equal(Ast.source("alpha", { type: "generated" }), undefined)
  })

  it("inspects the tree type hierarchy", () => {
    const inspected = Ast.inspect(Ast.make(tree()))

    assert.match(inspected, /root/)
    assert.match(inspected, /paragraph/)
    assert.match(inspected, /text/)
    assert.match(inspected, /1:1-1:18/)
  })
})
