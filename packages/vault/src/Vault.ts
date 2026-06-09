import type { MarkdownParseError } from "@kb/markdown-ast"
import { Context, Effect } from "effect"
import type * as Result from "effect/Result"
import type * as Trie from "effect/Trie"

import { MarkdownFile } from "./markdown/MarkdownModel"
import { allMarkdown, VaultScope } from "./VaultScope"

export type VaultFiles = Trie.Trie<Result.Result<MarkdownFile, MarkdownParseError>>

export interface Vault {
  readonly scope: VaultScope
  readonly files: VaultFiles
}

export class Vault extends Context.Service<Vault, Vault>()("@kb/vault-core/Vault") {
  static make({
    scope = allMarkdown,
    files
  }: {
    readonly scope?: VaultScope
    readonly files: VaultFiles
  }): Effect.Effect<Vault> {
    return Effect.succeed(Vault.of({ scope, files } as Vault))
  }
}
