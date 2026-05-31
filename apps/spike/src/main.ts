import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { remarkWikilinks } from "@kb/remark-wikilinks"
import { Effect, Schema, Console, Match } from "effect"
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

const program = Effect.gen(function* () {
  const fs = yield* FileSystem

  const taggedRoot = yield* fs.readFileString("./test.md").pipe(Effect.flatMap(parseAndRun))

  // const textNodes = Markdown.findAll(
  //   taggedRoot,
  //   ({ node }) => node._tag === "WikilinkNode" || node._tag === "BlockAnchorNode"
  // )
  //
  // for (let cursor of textNodes) {
  //   // if (!(cursor.node._tag === "WikilinkNode")) {
  //   //   continue
  //   // }
  //   yield* Effect.logInfo(cursor.node)
  // }

  // const xyz = Match.type<Markdown.AnyNode>().pipe(Match.tags("WikilinkNode"))

  const renamedLinks = Markdown.map(taggedRoot, ({ node }) =>
    Match.value(node).pipe(
      Match.when({ _tag: "WikilinkNode", target: "Personal" }, (link) => ({
        ...link,
        target: `${link.target} Updated`
      })),
      Match.orElse((node) => node)
    )
  )

  yield* stringify(renamedLinks as Markdown.Root).pipe(Effect.tap(Console.log))
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
