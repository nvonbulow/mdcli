import type { ObsidianTag } from "@kb/remark-obsidian"
import { Data, Trie } from "effect"
import type { Result } from "effect"
import type { MarkdownParseError } from "../VaultErrors"

export type SourcePosition = NonNullable<ObsidianTag["position"]>
export type SourcePoint = SourcePosition["start"]

export class MarkdownFile extends Data.Class<{
  readonly path?: string
  readonly contents: string
  readonly mdast: unknown
}> {}

export type MarkdownTree = {
  readonly root: string
  readonly files: Trie.Trie<Result.Result<MarkdownFile, MarkdownParseError>>
}
