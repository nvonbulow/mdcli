import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Iterable, Schema } from "effect"
import { FileSystem } from "effect/FileSystem"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkStringify from "remark-stringify"

import * as Markdown from "./markdown"

const processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkGfm).use(remarkStringify)

const parseAndRun = (markdown: string) =>
  Effect.try({
    try: () => processor.runSync(processor.parse(markdown)) as Root,
    catch: () => "parse/run failed"
  })

const stringify = (root: Root) =>
  Effect.try({
    try: () => processor.stringify(root),
    catch: () => "stringify failed"
  })

const program = Effect.gen(function* () {
  const fs = yield* FileSystem

  const taggedRoot = yield* fs
    .readFileString("./test.md")
    .pipe(Effect.flatMap(parseAndRun), Effect.flatMap(Schema.decodeUnknownEffect(Markdown.Root)))

  const textNodes = Markdown.findAll(taggedRoot, ({ node }) => node._tag === "TextNode")

  for (let cursor of textNodes) {
    if (!(cursor.node._tag === "TextNode")) {
      continue
    }
    yield* Effect.logInfo(cursor.node.value)
  }

  // const markdown = yield* stringify(taggedRoot as any)
  // const listNode: Markdown.ListNode = taggedRoot.children[5] as any
  // listNode.children
  // yield* Console.log(listNode)
  // yield* Markdown.visit(taggedRoot, (node) => Effect.logInfo(node._tag))
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
