import { Chunk, String as Str } from "effect"

import type { Vault } from "./Vault"
import {
  headings,
  links,
  notes,
  tags,
  type VaultHeadingRecord,
  type VaultLinkRecord,
  type VaultNoteRecord,
  type VaultTagRecord
} from "./VaultProjections"

export type VaultSearchResult =
  | { readonly _tag: "Note"; readonly path: string; readonly text: string; readonly record: VaultNoteRecord }
  | { readonly _tag: "Heading"; readonly path: string; readonly text: string; readonly record: VaultHeadingRecord }
  | { readonly _tag: "Link"; readonly path: string; readonly text: string; readonly record: VaultLinkRecord }
  | { readonly _tag: "Tag"; readonly path: string; readonly text: string; readonly record: VaultTagRecord }

export const search = (vault: Vault, query: string): Chunk.Chunk<VaultSearchResult> => {
  const needle = Str.toLowerCase(query)
  const results: Array<VaultSearchResult> = []

  for (const note of notes(vault)) {
    const title = titleFromPath(note.path)
    if (matches(needle, note.path, title)) {
      results.push({ _tag: "Note", path: note.path, text: title, record: note })
    }
  }
  for (const heading of headings(vault)) {
    if (matches(needle, heading.text)) {
      results.push({ _tag: "Heading", path: heading.path, text: heading.text, record: heading })
    }
  }
  for (const link of links(vault)) {
    if (matches(needle, link.value, link.target, link.alias, link.heading, link.block)) {
      results.push({ _tag: "Link", path: link.path, text: link.value, record: link })
    }
  }
  for (const tag of tags(vault)) {
    if (matches(needle, tag.value)) {
      results.push({ _tag: "Tag", path: tag.path, text: tag.value, record: tag })
    }
  }
  return Chunk.fromIterable(results)
}

const titleFromPath = (path: string): string => {
  const lastSlash = path.lastIndexOf("/")
  const fileName = lastSlash === -1 ? path : path.slice(lastSlash + 1)
  return Str.endsWith(".md")(fileName) ? fileName.slice(0, -3) : fileName
}

const matches = (needle: string, ...values: ReadonlyArray<string | undefined>): boolean => {
  for (const value of values) {
    if (value !== undefined && Str.includes(needle)(Str.toLowerCase(value))) {
      return true
    }
  }
  return false
}
