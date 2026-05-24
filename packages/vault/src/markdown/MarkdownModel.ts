import { Chunk, Data, Trie } from "effect"

export class SourceSpan extends Data.Class<{
  readonly start: number
  readonly end: number
}> {}

export class RawFrontmatter extends Data.Class<{
  readonly value: string
  readonly language?: string
  readonly span?: SourceSpan
}> {}

export class MarkdownHeading extends Data.Class<{
  readonly depth: number
  readonly text: string
  readonly span?: SourceSpan
}> {}

export class MarkdownWikilink extends Data.Class<{
  readonly target: string
  readonly value: string
  readonly original: string
  readonly alias?: string
  readonly heading?: string
  readonly block?: string
  readonly span?: SourceSpan
}> {}

export class MarkdownInlineField extends Data.Class<{
  readonly key: string
  readonly value: string
  readonly original: string
  readonly valueStart: number
  readonly valueEnd: number
  readonly span: SourceSpan
}> {}

export class MarkdownTag extends Data.Class<{
  readonly value: string
  readonly span?: SourceSpan
}> {}

export class MarkdownListItem extends Data.Class<{
  readonly text: string
  readonly checked?: boolean
  readonly span?: SourceSpan
}> {}

export class MarkdownTask extends Data.Class<{
  readonly done: boolean
  readonly text: string
  readonly fields: Chunk.Chunk<MarkdownInlineField>
  readonly tags: Chunk.Chunk<MarkdownTag>
  readonly span?: SourceSpan
}> {}

export class MarkdownFencedBlock extends Data.Class<{
  readonly language?: string
  readonly meta?: string
  readonly value: string
  readonly span?: SourceSpan
}> {}

export class MarkdownFile extends Data.Class<{
  readonly path?: string
  readonly contents: string
  readonly mdast: unknown
}> {}

export type MarkdownTree = {
  readonly root: string
  readonly files: Trie.Trie<MarkdownFile>
}
