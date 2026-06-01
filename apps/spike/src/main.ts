import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { remarkWikilinks } from "@kb/remark-wikilinks"
import { Effect, Schema, Console, Option } from "effect"
import { FileSystem } from "effect/FileSystem"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkStringify from "remark-stringify"

import * as Markdown from "./markdown"

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkWikilinks)
  .use(remarkStringify, Markdown.markdownStringifyOptions)

const parseAndRun = (markdown: string) =>
  Effect.try({
    try: () => processor.runSync(processor.parse(markdown)) as Root,
    catch: () => "parse/run failed"
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Markdown.Root)))

const stringify = (root: Markdown.Root) =>
  Schema.encodeEffect(Markdown.Root)(root).pipe(
    Effect.flatMap((encoded) =>
      Effect.try({
        try: () => processor.stringify(encoded as Root),
        catch: () => "stringify failed"
      })
    )
  )

const tableOfContentsLines = (
  entries: ReadonlyArray<Markdown.TableOfContentsEntry>,
  indent = 0
): ReadonlyArray<string> => {
  const lines: Array<string> = []
  const prefix = "  ".repeat(indent)

  for (const entry of entries) {
    lines.push(`${prefix}${"#".repeat(entry.depth)} ${entry.text}`)
    lines.push(...tableOfContentsLines(entry.children, indent + 1))
  }

  return lines
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem

  const taggedRoot = yield* fs.readFileString("./test.md").pipe(Effect.flatMap(parseAndRun))

  const toc = Markdown.tableOfContents(taggedRoot)
  yield* Console.log("Table of contents:")
  yield* Console.log(tableOfContentsLines(toc).join("\n"))

  yield* Console.log("First heading text:")
  if (toc[0] === undefined) {
    yield* Console.log("(none)")
  } else {
    yield* Console.log(Markdown.headingText(toc[0].heading))
  }

  yield* Console.log("YAML frontmatter node:")
  const frontmatterNode = Markdown.yamlFrontmatterNode(taggedRoot)
  if (Option.isSome(frontmatterNode)) {
    yield* Console.log({ tag: frontmatterNode.value._tag, value: frontmatterNode.value.value })
  } else {
    yield* Console.log("(none)")
  }

  yield* Console.log("YAML frontmatter value:")
  const frontmatter = Markdown.yamlFrontmatter(taggedRoot)
  if (Option.isSome(frontmatter)) {
    yield* Console.log(frontmatter.value)
  } else {
    yield* Console.log("(none)")
  }

  yield* Console.log("All wikilinks:")
  yield* Console.log(Array.from(Markdown.wikilinks(taggedRoot)))

  yield* Console.log("Wikilinks targeting Personal:")
  yield* Console.log(Array.from(Markdown.wikilinksWithTarget("Personal")(taggedRoot)))

  const renamedLinks = Markdown.renameWikilinkTarget(taggedRoot, "Personal", "Personal Updated")

  yield* Console.log("Markdown after renaming Personal wikilinks:")
  yield* stringify(renamedLinks as Markdown.Root).pipe(Effect.tap(Console.log))
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
