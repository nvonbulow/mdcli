import { strict as assert } from "node:assert"
import type { Root as MdastRoot } from "mdast"
import { Effect, Option } from "effect"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import type { Processor } from "unified"
import { unified } from "unified"
import { describe, it } from "vitest"

import * as Markdown from "../src/markdown"

type MarkdownUnifiedProcessor = Processor<MdastRoot, MdastRoot, MdastRoot, MdastRoot, string>

const bareProcessor = (): MarkdownUnifiedProcessor =>
  unified().use(remarkParse).use(remarkStringify, Markdown.markdownStringifyOptions) as unknown as MarkdownUnifiedProcessor

const invalidProcessor = (): MarkdownUnifiedProcessor =>
  unified()
    .use(remarkParse)
    .use(() => (tree: MdastRoot) => {
      tree.children.push({ type: "unsupported" } as never)
      return tree
    })
    .use(remarkStringify, Markdown.markdownStringifyOptions) as unknown as MarkdownUnifiedProcessor


const firstText = (root: Markdown.Root): Markdown.TextNode | undefined =>
  Array.from(Markdown.findAll(root, ({ node }) => node._tag === "TextNode"), ({ node }) => node as Markdown.TextNode)[0]

describe("MarkdownProcessor", () => {
  it("parses and stringifies default markdown features including unaligned GFM table columns", () => {
    const source = "---\ntitle: Test\n---\n\n- [x] Task [[Target]]\n\n| Name | Count |\n| --- | ---: |\n| Alpha | 1 |\n"
    const processor = Markdown.MarkdownProcessor.make()
    const root = Effect.runSync(processor.parse(source))
    const table = Array.from(
      Markdown.findAll(root, ({ node }) => node._tag === "TableNode"),
      ({ node }) => node as Markdown.TableNode
    )[0]

    assert.ok(table)
    assert.equal(Option.isSome(table.align), true)
    if (Option.isSome(table.align)) {
      assert.deepEqual(table.align.value, [null, "right"])
    }

    const wikilinks = Array.from(Markdown.wikilinks(root))
    assert.equal(wikilinks.length, 1)
    assert.equal(wikilinks[0]?.target, "Target")

    const rendered = Effect.runSync(processor.stringify(root))
    assert.match(rendered, /- \[x\] Task \[\[Target\]\]/)
    assert.match(rendered, /\| Name  \| Count \|/)
  })

  it("make uses the supplied processor instance", () => {
    const processor = Markdown.MarkdownProcessor.make(bareProcessor())
    const root = Effect.runSync(processor.parse("[[Target]]"))

    assert.equal(firstText(root)?.value, "[[Target]]")
    assert.equal(Array.from(Markdown.wikilinks(root)).length, 0)
  })

  it("makeLayer provides the supplied processor through Effect context", () => {
    const root = Effect.runSync(
      Effect.gen(function* () {
        const processor = yield* Markdown.MarkdownProcessor
        return yield* processor.parse("[[Target]]")
      }).pipe(Effect.provide(Markdown.MarkdownProcessor.makeLayer(bareProcessor())))
    )

    assert.equal(firstText(root)?.value, "[[Target]]")
    assert.equal(Array.from(Markdown.wikilinks(root)).length, 0)
  })

  it("maps parse and decode failures to MarkdownParseError", () => {
    const processor = Markdown.MarkdownProcessor.make(invalidProcessor())
    const error = Effect.runSync(processor.parse("bad").pipe(Effect.flip))

    assert.ok(error instanceof Markdown.MarkdownParseError)
    assert.equal(error._tag, "MarkdownParseError")
    assert.equal(error.input, "bad")
    assert.match(error.message, /unsupported|Unexpected|Expected|Missing/i)
  })
})
