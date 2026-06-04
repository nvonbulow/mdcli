import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from "effect"
import * as Yaml from "yaml"

const fromYamlString = SchemaTransformation.transformOrFail<unknown, string>({
  encode: (r) => Effect.succeed(Yaml.stringify(r)),
  decode: (s) =>
    Effect.try({
      try: () => Yaml.parse(s),
      catch: (error) => new SchemaIssue.InvalidValue(Option.some(s))
    })
})
const UnknownFromYamlString = Schema.String.pipe(Schema.decodeTo(Schema.Unknown, fromYamlString))

const PositiveInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

// Shared Fields
export const Position = Schema.Struct({
  line: PositiveInteger,
  column: PositiveInteger,
  offset: PositiveInteger
})
export type Position = typeof Position.Type

const PositionField = Schema.Struct({
  start: Position,
  end: Position
})
type PositionField = typeof PositionField.Type

type NodeFields<Type extends string, Tag extends string> = {
  readonly _tag: Tag
  readonly type: Type
  readonly position?: PositionField
}

type ParentFields<Type extends string, Tag extends string, Child> = NodeFields<Type, Tag> & {
  readonly children: ReadonlyArray<Child>
}

type LiteralFields<Type extends string, Tag extends string, Value> = NodeFields<Type, Tag> & {
  readonly value: Value
}

export const BaseNode = Schema.Struct({
  type: Schema.String,
  position: Schema.optionalKey(PositionField)
})
export type BaseNode = typeof BaseNode.Type

export const ParentNode = Schema.Struct({
  ...BaseNode.fields,
  children: Schema.Array(Schema.Unknown)
})
export type ParentNode = typeof ParentNode.Type

export const LiteralNode = Schema.Struct({
  ...BaseNode.fields,
  value: Schema.Unknown
})
export type LiteralNode = typeof LiteralNode.Type

// Concrete Node Types
export interface Root extends ParentFields<"root", "Root", RootContentNode> {}
export interface BlockquoteNode extends ParentFields<"blockquote", "BlockquoteNode", BlockDefinitionContentNode> {}
export interface BreakNode extends NodeFields<"break", "BreakNode"> {}
export interface CodeNode extends LiteralFields<"code", "CodeNode", string> {
  readonly lang: Option.Option<string>
  readonly meta: Option.Option<string>
}
export interface DefinitionNode extends NodeFields<"definition", "DefinitionNode"> {
  readonly identifier: string
  readonly label: Option.Option<string>
  readonly url: string
  readonly title: Option.Option<string>
}
export interface DeleteNode extends ParentFields<"delete", "DeleteNode", PhrasingContentNode> {}
export interface EmphasisNode extends ParentFields<"emphasis", "EmphasisNode", PhrasingContentNode> {}
export interface FootnoteDefinitionNode extends ParentFields<
  "footnoteDefinition",
  "FootnoteDefinitionNode",
  BlockDefinitionContentNode
> {
  readonly identifier: string
  readonly label: Option.Option<string>
}
export interface FootnoteReferenceNode extends NodeFields<"footnoteReference", "FootnoteReferenceNode"> {
  readonly identifier: string
  readonly label: Option.Option<string>
}
export interface HeadingNode extends ParentFields<"heading", "HeadingNode", PhrasingContentNode> {
  readonly depth: typeof HeadingLevel.Type
}
export interface HtmlNode extends LiteralFields<"html", "HtmlNode", string> {}
export interface ImageNode extends NodeFields<"image", "ImageNode"> {
  readonly url: string
  readonly title: Option.Option<string>
  readonly alt: Option.Option<string>
}
export interface ImageReferenceNode extends NodeFields<"imageReference", "ImageReferenceNode"> {
  readonly identifier: string
  readonly label: Option.Option<string>
  readonly referenceType: typeof ReferenceType.Type
  readonly alt: Option.Option<string>
}
export interface InlineCodeNode extends LiteralFields<"inlineCode", "InlineCodeNode", string> {}
export interface LinkNode extends ParentFields<"link", "LinkNode", PhrasingContentNode> {
  readonly url: string
  readonly title: Option.Option<string>
}
export interface LinkReferenceNode extends ParentFields<"linkReference", "LinkReferenceNode", PhrasingContentNode> {
  readonly identifier: string
  readonly label: Option.Option<string>
  readonly referenceType: typeof ReferenceType.Type
}
export interface ListNode extends ParentFields<"list", "ListNode", ListContentNode> {
  readonly ordered: Option.Option<boolean>
  readonly start: Option.Option<number>
  readonly spread: Option.Option<boolean>
}
export interface ListItemNode extends ParentFields<"listItem", "ListItemNode", BlockDefinitionContentNode> {
  readonly checked: Option.Option<boolean>
  readonly spread: Option.Option<boolean>
}
export interface ParagraphNode extends ParentFields<"paragraph", "ParagraphNode", PhrasingContentNode> {}
export interface WikilinkNode extends LiteralFields<"wikilink", "WikilinkNode", string> {
  readonly target: string
  readonly header: Option.Option<string>
  readonly block: Option.Option<string>
  readonly alias: Option.Option<string>
  readonly embed: Option.Option<boolean>
  readonly original: string
}
export interface BlockAnchorNode extends LiteralFields<"blockAnchor", "BlockAnchorNode", string> {
  readonly id: string
  readonly original: string
}
export interface StrongNode extends ParentFields<"strong", "StrongNode", PhrasingContentNode> {}
export interface TableNode extends ParentFields<"table", "TableNode", TableContentNode> {
  readonly align: Option.Option<ReadonlyArray<typeof TableAlign.Type>>
}
export interface TableCellNode extends ParentFields<"tableCell", "TableCellNode", PhrasingContentNode> {}
export interface TableRowNode extends ParentFields<"tableRow", "TableRowNode", RowContentNode> {}
export interface TextNode extends LiteralFields<"text", "TextNode", string> {}
export interface ThematicBreakNode extends NodeFields<"thematicBreak", "ThematicBreakNode"> {}
export interface YamlFrontmatterNode extends LiteralFields<"yaml", "YamlFrontmatterNode", unknown> {}

// Content Union Types
export type BlockContentNode =
  | BlockquoteNode
  | CodeNode
  | HeadingNode
  | HtmlNode
  | ListNode
  | ParagraphNode
  | TableNode
  | ThematicBreakNode

export type DefinitionContentNode = DefinitionNode | FootnoteDefinitionNode
export type BlockDefinitionContentNode = BlockContentNode | DefinitionContentNode
export type ListContentNode = ListItemNode

export type PhrasingContentNode =
  | BlockAnchorNode
  | BreakNode
  | DeleteNode
  | EmphasisNode
  | FootnoteReferenceNode
  | HtmlNode
  | ImageNode
  | ImageReferenceNode
  | InlineCodeNode
  | LinkNode
  | LinkReferenceNode
  | StrongNode
  | TextNode
  | WikilinkNode

export type RootContentNode =
  | BlockquoteNode
  | BlockAnchorNode
  | BreakNode
  | CodeNode
  | DefinitionNode
  | DeleteNode
  | EmphasisNode
  | FootnoteDefinitionNode
  | FootnoteReferenceNode
  | HeadingNode
  | HtmlNode
  | ImageNode
  | ImageReferenceNode
  | InlineCodeNode
  | LinkNode
  | LinkReferenceNode
  | ListNode
  | ListItemNode
  | ParagraphNode
  | StrongNode
  | TableNode
  | TableCellNode
  | TableRowNode
  | TextNode
  | ThematicBreakNode
  | WikilinkNode
  | YamlFrontmatterNode

export type RowContentNode = TableCellNode
export type TableContentNode = TableRowNode

export type AnyNode =
  | BlockquoteNode
  | BlockAnchorNode
  | BreakNode
  | CodeNode
  | DefinitionNode
  | DeleteNode
  | EmphasisNode
  | FootnoteDefinitionNode
  | FootnoteReferenceNode
  | HeadingNode
  | HtmlNode
  | ImageNode
  | ImageReferenceNode
  | InlineCodeNode
  | LinkNode
  | LinkReferenceNode
  | ListNode
  | ListItemNode
  | ParagraphNode
  | Root
  | StrongNode
  | TableNode
  | TableCellNode
  | TableRowNode
  | TextNode
  | ThematicBreakNode
  | WikilinkNode
  | YamlFrontmatterNode

type EncodedOption<Value> = Value | null | undefined
type EncodedTag<Tag extends string> = { readonly _tag?: Tag }

type RootEncoded = BaseNode &
  EncodedTag<"Root"> & {
    readonly type: "root"
    readonly children: ReadonlyArray<RootContentNodeEncoded>
  }
type BlockquoteNodeEncoded = BaseNode &
  EncodedTag<"BlockquoteNode"> & {
    readonly type: "blockquote"
    readonly children: ReadonlyArray<BlockDefinitionContentNodeEncoded>
  }
type BreakNodeEncoded = BaseNode &
  EncodedTag<"BreakNode"> & {
    readonly type: "break"
  }
type CodeNodeEncoded = BaseNode &
  EncodedTag<"CodeNode"> & {
    readonly type: "code"
    readonly value: string
    readonly lang: EncodedOption<string>
    readonly meta: EncodedOption<string>
  }
type DefinitionNodeEncoded = BaseNode &
  EncodedTag<"DefinitionNode"> & {
    readonly type: "definition"
    readonly identifier: string
    readonly label: EncodedOption<string>
    readonly url: string
    readonly title: EncodedOption<string>
  }
type DeleteNodeEncoded = BaseNode &
  EncodedTag<"DeleteNode"> & {
    readonly type: "delete"
    readonly children: ReadonlyArray<PhrasingContentNodeEncoded>
  }
type EmphasisNodeEncoded = BaseNode &
  EncodedTag<"EmphasisNode"> & {
    readonly type: "emphasis"
    readonly children: ReadonlyArray<PhrasingContentNodeEncoded>
  }
type FootnoteDefinitionNodeEncoded = BaseNode &
  EncodedTag<"FootnoteDefinitionNode"> & {
    readonly type: "footnoteDefinition"
    readonly identifier: string
    readonly label: EncodedOption<string>
    readonly children: ReadonlyArray<BlockDefinitionContentNodeEncoded>
  }
type FootnoteReferenceNodeEncoded = BaseNode &
  EncodedTag<"FootnoteReferenceNode"> & {
    readonly type: "footnoteReference"
    readonly identifier: string
    readonly label: EncodedOption<string>
  }
type HeadingNodeEncoded = BaseNode &
  EncodedTag<"HeadingNode"> & {
    readonly type: "heading"
    readonly depth: typeof HeadingLevel.Type
    readonly children: ReadonlyArray<PhrasingContentNodeEncoded>
  }
type HtmlNodeEncoded = BaseNode &
  EncodedTag<"HtmlNode"> & {
    readonly type: "html"
    readonly value: string
  }
type ImageNodeEncoded = BaseNode &
  EncodedTag<"ImageNode"> & {
    readonly type: "image"
    readonly url: string
    readonly title: EncodedOption<string>
    readonly alt: EncodedOption<string>
  }
type ImageReferenceNodeEncoded = BaseNode &
  EncodedTag<"ImageReferenceNode"> & {
    readonly type: "imageReference"
    readonly identifier: string
    readonly label: EncodedOption<string>
    readonly referenceType: typeof ReferenceType.Type
    readonly alt: EncodedOption<string>
  }
type InlineCodeNodeEncoded = BaseNode &
  EncodedTag<"InlineCodeNode"> & {
    readonly type: "inlineCode"
    readonly value: string
  }
type LinkNodeEncoded = BaseNode &
  EncodedTag<"LinkNode"> & {
    readonly type: "link"
    readonly url: string
    readonly title: EncodedOption<string>
    readonly children: ReadonlyArray<PhrasingContentNodeEncoded>
  }
type LinkReferenceNodeEncoded = BaseNode &
  EncodedTag<"LinkReferenceNode"> & {
    readonly type: "linkReference"
    readonly identifier: string
    readonly label: EncodedOption<string>
    readonly referenceType: typeof ReferenceType.Type
    readonly children: ReadonlyArray<PhrasingContentNodeEncoded>
  }
type ListNodeEncoded = BaseNode &
  EncodedTag<"ListNode"> & {
    readonly type: "list"
    readonly children: ReadonlyArray<ListContentNodeEncoded>
    readonly ordered: EncodedOption<boolean>
    readonly start: EncodedOption<number>
    readonly spread: EncodedOption<boolean>
  }
type ListItemNodeEncoded = BaseNode &
  EncodedTag<"ListItemNode"> & {
    readonly type: "listItem"
    readonly children: ReadonlyArray<BlockDefinitionContentNodeEncoded>
    readonly checked: EncodedOption<boolean>
    readonly spread: EncodedOption<boolean>
  }
type ParagraphNodeEncoded = BaseNode &
  EncodedTag<"ParagraphNode"> & {
    readonly type: "paragraph"
    readonly children: ReadonlyArray<PhrasingContentNodeEncoded>
  }
type WikilinkNodeEncoded = BaseNode &
  EncodedTag<"WikilinkNode"> & {
    readonly type: "wikilink"
    readonly value: string
    readonly target: string
    readonly header?: string
    readonly block?: string
    readonly alias?: string
    readonly embed?: boolean
    readonly original: string
  }
type BlockAnchorNodeEncoded = BaseNode &
  EncodedTag<"BlockAnchorNode"> & {
    readonly type: "blockAnchor"
    readonly value: string
    readonly id: string
    readonly original: string
  }
type StrongNodeEncoded = BaseNode &
  EncodedTag<"StrongNode"> & {
    readonly type: "strong"
    readonly children: ReadonlyArray<PhrasingContentNodeEncoded>
  }
type TableNodeEncoded = BaseNode &
  EncodedTag<"TableNode"> & {
    readonly type: "table"
    readonly align: EncodedOption<ReadonlyArray<typeof TableAlign.Type>>
    readonly children: ReadonlyArray<TableContentNodeEncoded>
  }
type TableCellNodeEncoded = BaseNode &
  EncodedTag<"TableCellNode"> & {
    readonly type: "tableCell"
    readonly children: ReadonlyArray<PhrasingContentNodeEncoded>
  }
type TableRowNodeEncoded = BaseNode &
  EncodedTag<"TableRowNode"> & {
    readonly type: "tableRow"
    readonly children: ReadonlyArray<RowContentNodeEncoded>
  }
type TextNodeEncoded = BaseNode &
  EncodedTag<"TextNode"> & {
    readonly type: "text"
    readonly value: string
  }
type ThematicBreakNodeEncoded = BaseNode &
  EncodedTag<"ThematicBreakNode"> & {
    readonly type: "thematicBreak"
  }
type YamlFrontmatterNodeEncoded = BaseNode &
  EncodedTag<"YamlFrontmatterNode"> & {
    readonly type: "yaml"
    readonly value: string
  }

type BlockContentNodeEncoded =
  | BlockquoteNodeEncoded
  | CodeNodeEncoded
  | HeadingNodeEncoded
  | HtmlNodeEncoded
  | ListNodeEncoded
  | ParagraphNodeEncoded
  | TableNodeEncoded
  | ThematicBreakNodeEncoded

type DefinitionContentNodeEncoded = DefinitionNodeEncoded | FootnoteDefinitionNodeEncoded
type BlockDefinitionContentNodeEncoded = BlockContentNodeEncoded | DefinitionContentNodeEncoded
type ListContentNodeEncoded = ListItemNodeEncoded

type PhrasingContentNodeEncoded =
  | BlockAnchorNodeEncoded
  | BreakNodeEncoded
  | DeleteNodeEncoded
  | EmphasisNodeEncoded
  | FootnoteReferenceNodeEncoded
  | HtmlNodeEncoded
  | ImageNodeEncoded
  | ImageReferenceNodeEncoded
  | InlineCodeNodeEncoded
  | LinkNodeEncoded
  | LinkReferenceNodeEncoded
  | StrongNodeEncoded
  | TextNodeEncoded
  | WikilinkNodeEncoded

type RootContentNodeEncoded =
  | BlockquoteNodeEncoded
  | BlockAnchorNodeEncoded
  | BreakNodeEncoded
  | CodeNodeEncoded
  | DefinitionNodeEncoded
  | DeleteNodeEncoded
  | EmphasisNodeEncoded
  | FootnoteDefinitionNodeEncoded
  | FootnoteReferenceNodeEncoded
  | HeadingNodeEncoded
  | HtmlNodeEncoded
  | ImageNodeEncoded
  | ImageReferenceNodeEncoded
  | InlineCodeNodeEncoded
  | LinkNodeEncoded
  | LinkReferenceNodeEncoded
  | ListNodeEncoded
  | ListItemNodeEncoded
  | ParagraphNodeEncoded
  | StrongNodeEncoded
  | TableNodeEncoded
  | TableCellNodeEncoded
  | TableRowNodeEncoded
  | TextNodeEncoded
  | ThematicBreakNodeEncoded
  | WikilinkNodeEncoded
  | YamlFrontmatterNodeEncoded

type RowContentNodeEncoded = TableCellNodeEncoded
type TableContentNodeEncoded = TableRowNodeEncoded
type AnyNodeEncoded =
  | BlockquoteNodeEncoded
  | BlockAnchorNodeEncoded
  | BreakNodeEncoded
  | CodeNodeEncoded
  | DefinitionNodeEncoded
  | DeleteNodeEncoded
  | EmphasisNodeEncoded
  | FootnoteDefinitionNodeEncoded
  | FootnoteReferenceNodeEncoded
  | HeadingNodeEncoded
  | HtmlNodeEncoded
  | ImageNodeEncoded
  | ImageReferenceNodeEncoded
  | InlineCodeNodeEncoded
  | LinkNodeEncoded
  | LinkReferenceNodeEncoded
  | ListNodeEncoded
  | ListItemNodeEncoded
  | ParagraphNodeEncoded
  | RootEncoded
  | StrongNodeEncoded
  | TableNodeEncoded
  | TableCellNodeEncoded
  | TableRowNodeEncoded
  | TextNodeEncoded
  | ThematicBreakNodeEncoded
  | WikilinkNodeEncoded
  | YamlFrontmatterNodeEncoded

const BlockDefinitionContentNodeRef: Schema.Codec<BlockDefinitionContentNode, BlockDefinitionContentNodeEncoded> =
  Schema.suspend(
    (): Schema.Codec<BlockDefinitionContentNode, BlockDefinitionContentNodeEncoded> => BlockDefinitionContentNode
  )
const RootContentNodeRef: Schema.Codec<RootContentNode, RootContentNodeEncoded> = Schema.suspend(
  (): Schema.Codec<RootContentNode, RootContentNodeEncoded> => RootContentNode
)
const PhrasingContentNodeRef: Schema.Codec<PhrasingContentNode, PhrasingContentNodeEncoded> = Schema.suspend(
  (): Schema.Codec<PhrasingContentNode, PhrasingContentNodeEncoded> => PhrasingContentNode
)
const ListContentNodeRef: Schema.Codec<ListContentNode, ListContentNodeEncoded> = Schema.suspend(
  (): Schema.Codec<ListContentNode, ListContentNodeEncoded> => ListContentNode
)
const RowContentNodeRef: Schema.Codec<RowContentNode, RowContentNodeEncoded> = Schema.suspend(
  (): Schema.Codec<RowContentNode, RowContentNodeEncoded> => RowContentNode
)
const TableContentNodeRef: Schema.Codec<TableContentNode, TableContentNodeEncoded> = Schema.suspend(
  (): Schema.Codec<TableContentNode, TableContentNodeEncoded> => TableContentNode
)

// Concrete Node Schemas
export const Root: Schema.Codec<Root, RootEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("Root"),
  type: Schema.tag("root"),
  children: Schema.Array(RootContentNodeRef)
})

export const BlockquoteNode: Schema.Codec<BlockquoteNode, BlockquoteNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("BlockquoteNode"),
  type: Schema.tag("blockquote"),
  children: Schema.Array(BlockDefinitionContentNodeRef)
})

export const BreakNode: Schema.Codec<BreakNode, BreakNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("BreakNode"),
  type: Schema.tag("break")
})

export const CodeNode: Schema.Codec<CodeNode, CodeNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("CodeNode"),
  type: Schema.tag("code"),
  value: Schema.String,
  lang: Schema.String.pipe(Schema.OptionFromNullishOr),
  meta: Schema.String.pipe(Schema.OptionFromNullishOr)
})

export const DefinitionNode: Schema.Codec<DefinitionNode, DefinitionNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("DefinitionNode"),
  type: Schema.tag("definition"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr),
  url: Schema.String,
  title: Schema.String.pipe(Schema.OptionFromNullishOr)
})

export const DeleteNode: Schema.Codec<DeleteNode, DeleteNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("DeleteNode"),
  type: Schema.tag("delete"),
  children: Schema.Array(PhrasingContentNodeRef)
})

export const EmphasisNode: Schema.Codec<EmphasisNode, EmphasisNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("EmphasisNode"),
  type: Schema.tag("emphasis"),
  children: Schema.Array(PhrasingContentNodeRef)
})

export const FootnoteDefinitionNode: Schema.Codec<FootnoteDefinitionNode, FootnoteDefinitionNodeEncoded> =
  Schema.Struct({
    ...BaseNode.fields,
    _tag: Schema.tagDefaultOmit("FootnoteDefinitionNode"),
    type: Schema.tag("footnoteDefinition"),
    identifier: Schema.String,
    label: Schema.String.pipe(Schema.OptionFromNullishOr),
    children: Schema.Array(BlockDefinitionContentNodeRef)
  })

export const FootnoteReferenceNode: Schema.Codec<FootnoteReferenceNode, FootnoteReferenceNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("FootnoteReferenceNode"),
  type: Schema.tag("footnoteReference"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr)
})

export const HeadingLevel = Schema.Literals([1, 2, 3, 4, 5, 6])
export const HeadingNode: Schema.Codec<HeadingNode, HeadingNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("HeadingNode"),
  type: Schema.tag("heading"),
  depth: HeadingLevel,
  children: Schema.Array(PhrasingContentNodeRef)
})

export const HtmlNode: Schema.Codec<HtmlNode, HtmlNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("HtmlNode"),
  type: Schema.tag("html"),
  value: Schema.String
})

export const ImageNode: Schema.Codec<ImageNode, ImageNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("ImageNode"),
  type: Schema.tag("image"),
  url: Schema.String,
  title: Schema.String.pipe(Schema.OptionFromNullishOr),
  alt: Schema.String.pipe(Schema.OptionFromNullishOr)
})

export const ReferenceType = Schema.Literals(["shortcut", "collapsed", "full"])
export const ImageReferenceNode: Schema.Codec<ImageReferenceNode, ImageReferenceNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("ImageReferenceNode"),
  type: Schema.tag("imageReference"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr),
  referenceType: ReferenceType,
  alt: Schema.String.pipe(Schema.OptionFromNullishOr)
})

export const InlineCodeNode: Schema.Codec<InlineCodeNode, InlineCodeNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("InlineCodeNode"),
  type: Schema.tag("inlineCode"),
  value: Schema.String
})

export const LinkNode: Schema.Codec<LinkNode, LinkNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("LinkNode"),
  type: Schema.tag("link"),
  url: Schema.String,
  title: Schema.String.pipe(Schema.OptionFromNullishOr),
  children: Schema.Array(PhrasingContentNodeRef)
})

export const LinkReferenceNode: Schema.Codec<LinkReferenceNode, LinkReferenceNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("LinkReferenceNode"),
  type: Schema.tag("linkReference"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr),
  referenceType: ReferenceType,
  children: Schema.Array(PhrasingContentNodeRef)
})

export const ListNode: Schema.Codec<ListNode, ListNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("ListNode"),
  type: Schema.tag("list"),
  children: Schema.Array(ListContentNodeRef),
  ordered: Schema.Boolean.pipe(Schema.OptionFromNullishOr),
  start: Schema.Number.pipe(Schema.OptionFromNullishOr),
  spread: Schema.Boolean.pipe(Schema.OptionFromNullishOr)
})

export const ListItemNode: Schema.Codec<ListItemNode, ListItemNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("ListItemNode"),
  type: Schema.tag("listItem"),
  children: Schema.Array(BlockDefinitionContentNodeRef),
  checked: Schema.Boolean.pipe(Schema.OptionFromNullishOr),
  spread: Schema.Boolean.pipe(Schema.OptionFromNullishOr)
})

export const ParagraphNode: Schema.Codec<ParagraphNode, ParagraphNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("ParagraphNode"),
  type: Schema.tag("paragraph"),
  children: Schema.Array(PhrasingContentNodeRef)
})

export const WikilinkNode: Schema.Codec<WikilinkNode, WikilinkNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("WikilinkNode"),
  type: Schema.tag("wikilink"),
  value: Schema.String,
  target: Schema.String,
  header: Schema.optionalKey(Schema.String).pipe(
    Schema.decodeTo(Schema.Option(Schema.String), SchemaTransformation.optionFromOptionalKey())
  ),
  block: Schema.optionalKey(Schema.String).pipe(
    Schema.decodeTo(Schema.Option(Schema.String), SchemaTransformation.optionFromOptionalKey())
  ),
  alias: Schema.optionalKey(Schema.String).pipe(
    Schema.decodeTo(Schema.Option(Schema.String), SchemaTransformation.optionFromOptionalKey())
  ),
  embed: Schema.optionalKey(Schema.Boolean).pipe(
    Schema.decodeTo(Schema.Option(Schema.Boolean), SchemaTransformation.optionFromOptionalKey())
  ),
  original: Schema.String
})

export const BlockAnchorNode: Schema.Codec<BlockAnchorNode, BlockAnchorNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("BlockAnchorNode"),
  type: Schema.tag("blockAnchor"),
  value: Schema.String,
  id: Schema.String,
  original: Schema.String
})

export const StrongNode: Schema.Codec<StrongNode, StrongNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("StrongNode"),
  type: Schema.tag("strong"),
  children: Schema.Array(PhrasingContentNodeRef)
})

export const AlignType = Schema.Literals(["center", "left", "right"])
export const TableAlign = Schema.NullOr(AlignType)
export const TableNode: Schema.Codec<TableNode, TableNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("TableNode"),
  type: Schema.tag("table"),
  align: Schema.Array(TableAlign).pipe(Schema.OptionFromNullishOr),
  children: Schema.Array(TableContentNodeRef)
})

export const TableCellNode: Schema.Codec<TableCellNode, TableCellNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("TableCellNode"),
  type: Schema.tag("tableCell"),
  children: Schema.Array(PhrasingContentNodeRef)
})

export const TableRowNode: Schema.Codec<TableRowNode, TableRowNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("TableRowNode"),
  type: Schema.tag("tableRow"),
  children: Schema.Array(RowContentNodeRef)
})

export const TextNode: Schema.Codec<TextNode, TextNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("TextNode"),
  type: Schema.tag("text"),
  value: Schema.String
})

export const ThematicBreakNode: Schema.Codec<ThematicBreakNode, ThematicBreakNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("ThematicBreakNode"),
  type: Schema.tag("thematicBreak")
})

export const YamlFrontmatterNode: Schema.Codec<YamlFrontmatterNode, YamlFrontmatterNodeEncoded> = Schema.Struct({
  ...BaseNode.fields,
  _tag: Schema.tagDefaultOmit("YamlFrontmatterNode"),
  type: Schema.tag("yaml"),
  value: UnknownFromYamlString
})

// Content Union Schemas
export const BlockContentNode: Schema.Codec<BlockContentNode, BlockContentNodeEncoded> = Schema.Union([
  BlockquoteNode,
  CodeNode,
  HeadingNode,
  HtmlNode,
  ListNode,
  ParagraphNode,
  TableNode,
  ThematicBreakNode
]).pipe(Schema.toTaggedUnion("_tag"))

export const DefinitionContentNode: Schema.Codec<DefinitionContentNode, DefinitionContentNodeEncoded> = Schema.Union([
  DefinitionNode,
  FootnoteDefinitionNode
]).pipe(Schema.toTaggedUnion("_tag"))

export const BlockDefinitionContentNode: Schema.Codec<BlockDefinitionContentNode, BlockDefinitionContentNodeEncoded> =
  Schema.Union([BlockContentNode, DefinitionContentNode]).pipe(Schema.toTaggedUnion("_tag"))

export const ListContentNode: Schema.Codec<ListContentNode, ListContentNodeEncoded> = ListItemNode

export const PhrasingContentNode: Schema.Codec<PhrasingContentNode, PhrasingContentNodeEncoded> = Schema.Union([
  BlockAnchorNode,
  BreakNode,
  DeleteNode,
  EmphasisNode,
  FootnoteReferenceNode,
  HtmlNode,
  ImageNode,
  ImageReferenceNode,
  InlineCodeNode,
  LinkNode,
  LinkReferenceNode,
  StrongNode,
  TextNode,
  WikilinkNode
]).pipe(Schema.toTaggedUnion("_tag"))

export const RootContentNode: Schema.Codec<RootContentNode, RootContentNodeEncoded> = Schema.Union([
  BlockAnchorNode,
  BlockquoteNode,
  BreakNode,
  CodeNode,
  DefinitionNode,
  DeleteNode,
  EmphasisNode,
  FootnoteDefinitionNode,
  FootnoteReferenceNode,
  HeadingNode,
  HtmlNode,
  ImageNode,
  ImageReferenceNode,
  InlineCodeNode,
  LinkNode,
  LinkReferenceNode,
  ListNode,
  ListItemNode,
  ParagraphNode,
  StrongNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  TextNode,
  ThematicBreakNode,
  WikilinkNode,
  YamlFrontmatterNode
]).pipe(Schema.toTaggedUnion("_tag"))

export const RowContentNode: Schema.Codec<RowContentNode, RowContentNodeEncoded> = TableCellNode

export const TableContentNode: Schema.Codec<TableContentNode, TableContentNodeEncoded> = TableRowNode

export const AnyNode: Schema.Codec<AnyNode, AnyNodeEncoded> = Schema.Union([
  BlockquoteNode,
  BlockAnchorNode,
  BreakNode,
  CodeNode,
  DefinitionNode,
  DeleteNode,
  EmphasisNode,
  FootnoteDefinitionNode,
  FootnoteReferenceNode,
  HeadingNode,
  HtmlNode,
  ImageNode,
  ImageReferenceNode,
  InlineCodeNode,
  LinkNode,
  LinkReferenceNode,
  ListNode,
  ListItemNode,
  ParagraphNode,
  Root,
  StrongNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  TextNode,
  ThematicBreakNode,
  WikilinkNode,
  YamlFrontmatterNode
]).pipe(Schema.toTaggedUnion("_tag"))
