import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Array as EffectArray, Console, Effect, Option, Trie, pipe, Iterable } from "effect"
import { FileSystem } from "effect/FileSystem"

import * as Markdown from "./markdown"
import path from "path/posix"

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
  const markdown = yield* Markdown.MarkdownProcessor

  const basePath = "/Users/nick/Documents/kb/vault"

  const readFile = (filePath: string) =>
    Effect.gen(function* () {
      const fullPath = path.join(basePath, filePath)
      const contents = yield* fs.readFileString(fullPath)
      const ast = yield* markdown.parse(contents)
      return {
        path: filePath,
        contents,
        ast
      }
    }).pipe(
      Effect.tapErrorTag("MarkdownParseError", (error) => Effect.logError(error.message)),
      Effect.annotateLogs("fileName", filePath)
    )

  const fileList = yield* fs
    .readDirectory(basePath, { recursive: true })
    .pipe(
      Effect.flatMap(Effect.filter((path) => path.endsWith(".md"))),
      Effect.flatMap(Effect.filter((path) => !path.startsWith(".agents"))),
      Effect.flatMap(Effect.forEach(readFile))
    )

  const markdownFiles = Trie.fromIterable(EffectArray.map(fileList, (file) => [file.path, file]))

  // find all files that reference 'Personal'

  const personalRefs = markdownFiles.pipe(
    Trie.filter(({ ast }) =>
      Option.isSome(Markdown.find(ast, ({ node }) => node._tag === "WikilinkNode" && node.target === "Personal"))
    )
  )

  // yield* personalRefs.pipe(Trie.keys, Effect.forEach(Console.log))

  const allLinks = markdownFiles.pipe(
    Trie.map(({ ast }) =>
      pipe(
        ast,
        Markdown.wikilinks,
        EffectArray.fromIterable,
        EffectArray.dedupeWith((a, b) => a.target === b.target)
      )
    )
  )

  const uniqueLinks = allLinks.pipe(
    Trie.values,
    EffectArray.fromIterable,
    EffectArray.flatten,
    EffectArray.dedupeWith((a, b) => a.target === b.target),
    EffectArray.map((link) => link.target)
  )

  yield* Effect.forEach(uniqueLinks, Console.log)

  return
})

program.pipe(Effect.provide(Markdown.MarkdownProcessor.layer), Effect.provide(NodeServices.layer), NodeRuntime.runMain)
