import type { Literal, ListItem } from "mdast"
import type { Data, Node, Position } from "unist"

export type SourceSpan = {
  readonly start: number
  readonly end: number
}

export type ObsidianTagData = Data & {
  readonly hName?: string
  readonly hProperties?: Readonly<Record<string, unknown>>
  readonly hChildren?: readonly Node[]
}

export type ObsidianTag = Literal & {
  readonly type: "obsidianTag"
  readonly value: string
  readonly original: string
  readonly position?: Position
  readonly data?: ObsidianTagData
}

export type ObsidianTaskData = {
  readonly done: boolean
  readonly text: string
  readonly rawText: string
  readonly tags: readonly ObsidianTag[]
  readonly inlineFields: readonly ObsidianInlineField[]
  readonly position?: Position
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
  readonly position?: Position
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
  readonly position?: Position
  readonly data?: ObsidianInlineFieldData
}

export type ObsidianListItem = ListItem & {
  readonly data?: Data & {
    readonly obsidianTask?: ObsidianTaskData
    readonly obsidianWikilinks?: readonly ObsidianWikilink[]
    readonly obsidianInlineFields?: readonly ObsidianInlineField[]
    readonly obsidianTags?: readonly ObsidianTag[]
  }
}

export type ObsidianPhrasingContent = ObsidianWikilink | ObsidianInlineField | ObsidianTag

export type ObsidianPhrasingContentMap = {
  readonly obsidianWikilink: ObsidianWikilink
  readonly obsidianInlineField: ObsidianInlineField
  readonly obsidianTag: ObsidianTag
}

export type ObsidianNodeData = ObsidianWikilinkData | ObsidianInlineFieldData | ObsidianTagData
