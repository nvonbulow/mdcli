import { Option, Result, Trie } from "effect"

import type { SourcePosition } from "./markdown/MarkdownModel"
import type { VaultShape } from "./Vault"

export const sourceLine = (vault: VaultShape, path: string, line: number): string | undefined =>
  lineOf(fileContents(vault, path), line)

export const sourceExcerpt = (vault: VaultShape, path: string, position: SourcePosition | undefined): string | undefined =>
  lineOf(fileContents(vault, path), position?.start.line)

const fileContents = (vault: VaultShape, path: string): string | undefined => {
  const result = Trie.get(vault.files, path)
  return Option.isSome(result) && Result.isSuccess(result.value) ? result.value.success.contents : undefined
}

const lineOf = (contents: string | undefined, lineNumber: number | undefined): string | undefined => {
  if (contents === undefined || lineNumber === undefined) {
    return undefined
  }
  let currentLine = 1
  let start = 0
  let index = 0
  while (index < contents.length) {
    if (contents.charCodeAt(index) === 10) {
      if (currentLine === lineNumber) {
        return contents.slice(start, index)
      }
      currentLine += 1
      start = index + 1
    }
    index += 1
  }
  return currentLine === lineNumber ? contents.slice(start) : undefined
}
