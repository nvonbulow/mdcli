import type { Literal } from "mdast"
import type { Data, Node } from "unist"

export type SourceSpan = {
  readonly start: number
  readonly end: number
}

export type ObsidianWikilinkData = Data & {
  readonly hName?: string
  readonly hProperties?: Readonly<Record<string, unknown>>
  readonly hChildren?: readonly Node[]
}

export type ObsidianWikilink = Literal & {
  readonly type: "obsidianWikilink"
  readonly value: string
  readonly target: string
  readonly alias?: string
  readonly heading?: string
  readonly block?: string
  readonly original: string
  readonly span?: SourceSpan
  readonly data?: ObsidianWikilinkData
}

export type ObsidianInlineFieldData = Data & {
  readonly hName?: string
  readonly hProperties?: Readonly<Record<string, unknown>>
  readonly hChildren?: readonly Node[]
}

export type ObsidianInlineField = Literal & {
  readonly type: "obsidianInlineField"
  readonly value: string
  readonly key: string
  readonly original: string
  readonly valueStart: number
  readonly valueEnd: number
  readonly span: SourceSpan
  readonly data?: ObsidianInlineFieldData
}

export type ObsidianPhrasingContent = ObsidianWikilink | ObsidianInlineField

export type ObsidianPhrasingContentMap = {
  readonly obsidianWikilink: ObsidianWikilink
  readonly obsidianInlineField: ObsidianInlineField
}

export type ObsidianNodeData = ObsidianWikilinkData | ObsidianInlineFieldData
