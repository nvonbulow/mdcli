import type { Root, SourcePosition } from "@kb/markdown-ast"
import type { MarkdownParseError } from "@kb/markdown-ast"
import { Data, Trie } from "effect"
import type { Result } from "effect"

export type { SourcePosition }
export type SourcePoint = SourcePosition["start"]

export class MarkdownFile extends Data.Class<{
  readonly path?: string
  readonly contents: string
  readonly mdast: Root
}> {}

export type MarkdownTree = {
  readonly root: string
  readonly files: Trie.Trie<Result.Result<MarkdownFile, MarkdownParseError>>
}
