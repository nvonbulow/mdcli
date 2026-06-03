import { strict as assert } from "node:assert"
import { Effect, Option } from "effect"
import { describe, it } from "vitest"

import * as Markdown from "../src/markdown"


const processor = Markdown.MarkdownProcessor.make()

const decode = (source: string): Markdown.Root => Effect.runSync(processor.parse(source))

const headings = (root: Markdown.Root): ReadonlyArray<Markdown.HeadingNode> =>
  Array.from(
    Markdown.findAll(root, ({ node }) => node._tag === "HeadingNode"),
    ({ node }) => node as Markdown.HeadingNode
  )

describe("Markdown query helpers", () => {
  it("builds a nested table of contents in source order", () => {
    const root = decode("# Root\n\n## Child A\n\n### Grandchild\n\n## Child B\n\n# Next")
    const toc = Markdown.tableOfContents(root)

    assert.deepEqual(
      toc.map((entry) => ({ text: entry.text, children: entry.children.map((child) => child.text) })),
      [
        { text: "Root", children: ["Child A", "Child B"] },
        { text: "Next", children: [] }
      ]
    )
    assert.equal(toc[0]?.children[0]?.children[0]?.text, "Grandchild")
  })

  it("derives heading text from nested phrasing and wikilink display values", () => {
    const root = decode("# Alpha *bravo **charlie** [[Target|Alias]]* `code`")
    const heading = headings(root)[0]

    assert.ok(heading)
    assert.equal(Markdown.headingText(heading), "Alpha bravo charlie Alias code")
  })

  it("nests skipped heading levels under the nearest prior shallower heading", () => {
    const root = decode("## Parent\n\n#### Skipped\n\n### Sibling")
    const toc = Markdown.tableOfContents(root)

    assert.equal(toc.length, 1)
    assert.equal(toc[0]?.text, "Parent")
    assert.deepEqual(toc[0]?.children.map((entry) => entry.text), ["Skipped", "Sibling"])
    assert.deepEqual(toc[0]?.children[0]?.children, [])
  })

  it("returns the parsed first YAML frontmatter value", () => {
    const root = decode("---\ntitle: Test\ntags:\n  - one\n---\n\n# Heading")
    const frontmatter = Markdown.yamlFrontmatter(root)

    assert.equal(Option.isSome(frontmatter), true)
    if (Option.isSome(frontmatter)) {
      assert.deepEqual(frontmatter.value, { title: "Test", tags: ["one"] })
    }
  })

  it("returns none when YAML frontmatter is absent", () => {
    const root = decode("# Heading")

    assert.equal(Option.isNone(Markdown.yamlFrontmatter(root)), true)
  })

  it("returns only wikilinks with the requested target", () => {
    const root = decode("[[A]] [[B|Bee]] [[A#Header]] [[#A]]")
    const links = Array.from(Markdown.wikilinksWithTarget("A")(root))

    assert.equal(links.length, 2)
    assert.deepEqual(
      links.map((link) => link.original),
      ["[[A]]", "[[A#Header]]"]
    )
  })
})
