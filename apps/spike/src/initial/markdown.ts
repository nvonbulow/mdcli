import type {
  Code,
  Definition,
  FootnoteDefinition,
  FootnoteReference,
  Heading,
  Html,
  Image,
  ImageReference,
  Link,
  LinkReference,
  List,
  ListItem,
  Root,
  Table,
  Text,
  Yaml,
  InlineCode
} from "mdast"
import type { Data as UnistData, Node, Position } from "unist"
import { Schema, SchemaTransformation } from "effect"

import type { ObsidianInlineField, ObsidianTag, ObsidianWikilink } from "@kb/remark-obsidian"

type ReferenceType = "shortcut" | "collapsed" | "full"

type CommonFields = {
  readonly position?: Position | undefined
  readonly data?: UnistData | undefined
}

const Type = <Type extends string>(type: Type) => Schema.Literal(type)
const OptionalAny = Schema.optional(Schema.Any)
const OptionalString = Schema.optional(Schema.String)
const OptionalNullishString = Schema.optional(Schema.NullOr(Schema.String))
const OptionalNullishBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const OptionalNullishNumber = Schema.optional(Schema.NullOr(Schema.Number))
const ReferenceTypeSchema = Schema.Literals(["shortcut", "collapsed", "full"])
const AlignTypeSchema = Schema.Union([Schema.Literals(["left", "right", "center"]), Schema.Null])

const Common = {
  position: OptionalAny,
  data: OptionalAny
} as const

const Children = Schema.Array(Schema.Any)

export class MarkdownRoot extends Schema.TaggedClass<MarkdownRoot>()("Root", {
  ...Common,
  type: Type("root"),
  children: Children
}) {
  declare readonly _tag: "Root"
  declare readonly type: "root"
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownParagraph extends Schema.TaggedClass<MarkdownParagraph>()("Paragraph", {
  ...Common,
  type: Type("paragraph"),
  children: Children
}) {
  declare readonly _tag: "Paragraph"
  declare readonly type: "paragraph"
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownHeading extends Schema.TaggedClass<MarkdownHeading>()("Heading", {
  ...Common,
  type: Type("heading"),
  depth: Schema.Number,
  children: Children
}) {
  declare readonly _tag: "Heading"
  declare readonly type: "heading"
  declare readonly depth: number
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownText extends Schema.TaggedClass<MarkdownText>()("Text", {
  ...Common,
  type: Type("text"),
  value: Schema.String
}) {
  declare readonly _tag: "Text"
  declare readonly type: "text"
  declare readonly value: string
}
export class MarkdownEmphasis extends Schema.TaggedClass<MarkdownEmphasis>()("Emphasis", {
  ...Common,
  type: Type("emphasis"),
  children: Children
}) {
  declare readonly _tag: "Emphasis"
  declare readonly type: "emphasis"
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownStrong extends Schema.TaggedClass<MarkdownStrong>()("Strong", {
  ...Common,
  type: Type("strong"),
  children: Children
}) {
  declare readonly _tag: "Strong"
  declare readonly type: "strong"
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownDelete extends Schema.TaggedClass<MarkdownDelete>()("Delete", {
  ...Common,
  type: Type("delete"),
  children: Children
}) {
  declare readonly _tag: "Delete"
  declare readonly type: "delete"
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownInlineCode extends Schema.TaggedClass<MarkdownInlineCode>()("InlineCode", {
  ...Common,
  type: Type("inlineCode"),
  value: Schema.String
}) {
  declare readonly _tag: "InlineCode"
  declare readonly type: "inlineCode"
  declare readonly value: string
}
export class MarkdownBreak extends Schema.TaggedClass<MarkdownBreak>()("Break", {
  ...Common,
  type: Type("break")
}) {
  declare readonly _tag: "Break"
  declare readonly type: "break"
}
export class MarkdownList extends Schema.TaggedClass<MarkdownList>()("List", {
  ...Common,
  type: Type("list"),
  ordered: OptionalNullishBoolean,
  start: OptionalNullishNumber,
  spread: OptionalNullishBoolean,
  children: Children
}) {
  declare readonly _tag: "List"
  declare readonly type: "list"
  declare readonly ordered?: boolean | null | undefined
  declare readonly start?: number | null | undefined
  declare readonly spread?: boolean | null | undefined
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownListItem extends Schema.TaggedClass<MarkdownListItem>()("ListItem", {
  ...Common,
  type: Type("listItem"),
  checked: OptionalNullishBoolean,
  spread: OptionalNullishBoolean,
  children: Children
}) {
  declare readonly _tag: "ListItem"
  declare readonly type: "listItem"
  declare readonly checked?: boolean | null | undefined
  declare readonly spread?: boolean | null | undefined
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownBlockquote extends Schema.TaggedClass<MarkdownBlockquote>()("Blockquote", {
  ...Common,
  type: Type("blockquote"),
  children: Children
}) {
  declare readonly _tag: "Blockquote"
  declare readonly type: "blockquote"
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownCode extends Schema.TaggedClass<MarkdownCode>()("Code", {
  ...Common,
  type: Type("code"),
  value: Schema.String,
  lang: OptionalNullishString,
  meta: OptionalNullishString
}) {
  declare readonly _tag: "Code"
  declare readonly type: "code"
  declare readonly value: string
  declare readonly lang?: string | null | undefined
  declare readonly meta?: string | null | undefined
}
export class MarkdownHtml extends Schema.TaggedClass<MarkdownHtml>()("Html", {
  ...Common,
  type: Type("html"),
  value: Schema.String
}) {
  declare readonly _tag: "Html"
  declare readonly type: "html"
  declare readonly value: string
}
export class MarkdownYaml extends Schema.TaggedClass<MarkdownYaml>()("Yaml", {
  ...Common,
  type: Type("yaml"),
  value: Schema.String
}) {
  declare readonly _tag: "Yaml"
  declare readonly type: "yaml"
  declare readonly value: string
}
export class MarkdownThematicBreak extends Schema.TaggedClass<MarkdownThematicBreak>()("ThematicBreak", {
  ...Common,
  type: Type("thematicBreak")
}) {
  declare readonly _tag: "ThematicBreak"
  declare readonly type: "thematicBreak"
}
export class MarkdownLink extends Schema.TaggedClass<MarkdownLink>()("Link", {
  ...Common,
  type: Type("link"),
  url: Schema.String,
  title: OptionalNullishString,
  children: Children
}) {
  declare readonly _tag: "Link"
  declare readonly type: "link"
  declare readonly url: string
  declare readonly title?: string | null | undefined
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownImage extends Schema.TaggedClass<MarkdownImage>()("Image", {
  ...Common,
  type: Type("image"),
  url: Schema.String,
  alt: OptionalNullishString,
  title: OptionalNullishString
}) {
  declare readonly _tag: "Image"
  declare readonly type: "image"
  declare readonly url: string
  declare readonly alt?: string | null | undefined
  declare readonly title?: string | null | undefined
}
export class MarkdownDefinition extends Schema.TaggedClass<MarkdownDefinition>()("Definition", {
  ...Common,
  type: Type("definition"),
  identifier: Schema.String,
  label: OptionalNullishString,
  url: Schema.String,
  title: OptionalNullishString
}) {
  declare readonly _tag: "Definition"
  declare readonly type: "definition"
  declare readonly identifier: string
  declare readonly label?: string | null | undefined
  declare readonly url: string
  declare readonly title?: string | null | undefined
}
export class MarkdownLinkReference extends Schema.TaggedClass<MarkdownLinkReference>()("LinkReference", {
  ...Common,
  type: Type("linkReference"),
  identifier: Schema.String,
  label: OptionalNullishString,
  referenceType: ReferenceTypeSchema,
  children: Children
}) {
  declare readonly _tag: "LinkReference"
  declare readonly type: "linkReference"
  declare readonly identifier: string
  declare readonly label?: string | null | undefined
  declare readonly referenceType: ReferenceType
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownImageReference extends Schema.TaggedClass<MarkdownImageReference>()("ImageReference", {
  ...Common,
  type: Type("imageReference"),
  identifier: Schema.String,
  label: OptionalNullishString,
  referenceType: ReferenceTypeSchema,
  alt: OptionalNullishString
}) {
  declare readonly _tag: "ImageReference"
  declare readonly type: "imageReference"
  declare readonly identifier: string
  declare readonly label?: string | null | undefined
  declare readonly referenceType: ReferenceType
  declare readonly alt?: string | null | undefined
}
export class MarkdownTable extends Schema.TaggedClass<MarkdownTable>()("Table", {
  ...Common,
  type: Type("table"),
  align: Schema.optional(Schema.NullOr(Schema.Array(AlignTypeSchema))),
  children: Children
}) {
  declare readonly _tag: "Table"
  declare readonly type: "table"
  declare readonly align?: ReadonlyArray<"left" | "right" | "center" | null> | null | undefined
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownTableRow extends Schema.TaggedClass<MarkdownTableRow>()("TableRow", {
  ...Common,
  type: Type("tableRow"),
  children: Children
}) {
  declare readonly _tag: "TableRow"
  declare readonly type: "tableRow"
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownTableCell extends Schema.TaggedClass<MarkdownTableCell>()("TableCell", {
  ...Common,
  type: Type("tableCell"),
  children: Children
}) {
  declare readonly _tag: "TableCell"
  declare readonly type: "tableCell"
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownFootnoteDefinition extends Schema.TaggedClass<MarkdownFootnoteDefinition>()("FootnoteDefinition", {
  ...Common,
  type: Type("footnoteDefinition"),
  identifier: Schema.String,
  label: OptionalNullishString,
  children: Children
}) {
  declare readonly _tag: "FootnoteDefinition"
  declare readonly type: "footnoteDefinition"
  declare readonly identifier: string
  declare readonly label?: string | null | undefined
  declare readonly children: ReadonlyArray<MarkdownNode>
}
export class MarkdownFootnoteReference extends Schema.TaggedClass<MarkdownFootnoteReference>()("FootnoteReference", {
  ...Common,
  type: Type("footnoteReference"),
  identifier: Schema.String,
  label: OptionalNullishString
}) {
  declare readonly _tag: "FootnoteReference"
  declare readonly type: "footnoteReference"
  declare readonly identifier: string
  declare readonly label?: string | null | undefined
}
export class MarkdownObsidianWikilink extends Schema.TaggedClass<MarkdownObsidianWikilink>()("ObsidianWikilink", {
  ...Common,
  type: Type("obsidianWikilink"),
  value: Schema.String,
  target: Schema.String,
  alias: OptionalString,
  heading: OptionalString,
  block: OptionalString,
  original: Schema.String
}) {
  declare readonly _tag: "ObsidianWikilink"
  declare readonly type: "obsidianWikilink"
  declare readonly value: string
  declare readonly target: string
  declare readonly alias?: string | undefined
  declare readonly heading?: string | undefined
  declare readonly block?: string | undefined
  declare readonly original: string
}
export class MarkdownObsidianInlineField extends Schema.TaggedClass<MarkdownObsidianInlineField>()(
  "ObsidianInlineField",
  {
    ...Common,
    type: Type("obsidianInlineField"),
    value: Schema.String,
    key: Schema.String,
    original: Schema.String,
    valueStart: Schema.Number,
    valueEnd: Schema.Number
  }
) {
  declare readonly _tag: "ObsidianInlineField"
  declare readonly type: "obsidianInlineField"
  declare readonly value: string
  declare readonly key: string
  declare readonly original: string
  declare readonly valueStart: number
  declare readonly valueEnd: number
}
export class MarkdownObsidianTag extends Schema.TaggedClass<MarkdownObsidianTag>()("ObsidianTag", {
  ...Common,
  type: Type("obsidianTag"),
  value: Schema.String,
  original: Schema.String
}) {
  declare readonly _tag: "ObsidianTag"
  declare readonly type: "obsidianTag"
  declare readonly value: string
  declare readonly original: string
}

export const TaggedMarkdownNodeSchema = Schema.Union([
  MarkdownRoot,
  MarkdownParagraph,
  MarkdownHeading,
  MarkdownText,
  MarkdownEmphasis,
  MarkdownStrong,
  MarkdownDelete,
  MarkdownInlineCode,
  MarkdownBreak,
  MarkdownList,
  MarkdownListItem,
  MarkdownBlockquote,
  MarkdownCode,
  MarkdownHtml,
  MarkdownYaml,
  MarkdownThematicBreak,
  MarkdownLink,
  MarkdownImage,
  MarkdownDefinition,
  MarkdownLinkReference,
  MarkdownImageReference,
  MarkdownTable,
  MarkdownTableRow,
  MarkdownTableCell,
  MarkdownFootnoteDefinition,
  MarkdownFootnoteReference,
  MarkdownObsidianWikilink,
  MarkdownObsidianInlineField,
  MarkdownObsidianTag
])

export type MarkdownNode = typeof TaggedMarkdownNodeSchema.Type

export type MarkdownParent = Extract<MarkdownNode, { readonly children: ReadonlyArray<MarkdownNode> }>

type TagName = MarkdownNode["_tag"]
type NodeByTag<Tag extends TagName> = Extract<MarkdownNode, { readonly _tag: Tag }>
type MarkdownNodeInput<Node extends MarkdownNode> = CommonFields & { readonly type: Node["type"] } & (Node extends {
    readonly children: infer Children
  }
    ? { readonly children: Children }
    : {}) &
  (Node extends { readonly depth: infer Depth } ? { readonly depth: Depth } : {}) &
  (Node extends { readonly value: infer Value } ? { readonly value: Value } : {}) &
  (Node extends { readonly ordered?: infer Ordered } ? { readonly ordered?: Ordered } : {}) &
  (Node extends { readonly start?: infer Start } ? { readonly start?: Start } : {}) &
  (Node extends { readonly spread?: infer Spread } ? { readonly spread?: Spread } : {}) &
  (Node extends { readonly checked?: infer Checked } ? { readonly checked?: Checked } : {}) &
  (Node extends { readonly lang?: infer Lang } ? { readonly lang?: Lang } : {}) &
  (Node extends { readonly meta?: infer Meta } ? { readonly meta?: Meta } : {}) &
  (Node extends { readonly url: infer Url } ? { readonly url: Url } : {}) &
  (Node extends { readonly alt?: infer Alt } ? { readonly alt?: Alt } : {}) &
  (Node extends { readonly title?: infer Title } ? { readonly title?: Title } : {}) &
  (Node extends { readonly identifier: infer Identifier } ? { readonly identifier: Identifier } : {}) &
  (Node extends { readonly label?: infer Label } ? { readonly label?: Label } : {}) &
  (Node extends { readonly referenceType: infer ReferenceType } ? { readonly referenceType: ReferenceType } : {}) &
  (Node extends { readonly align?: infer Align } ? { readonly align?: Align } : {}) &
  (Node extends { readonly target: infer Target } ? { readonly target: Target } : {}) &
  (Node extends { readonly alias?: infer Alias } ? { readonly alias?: Alias } : {}) &
  (Node extends { readonly heading?: infer Heading } ? { readonly heading?: Heading } : {}) &
  (Node extends { readonly block?: infer Block } ? { readonly block?: Block } : {}) &
  (Node extends { readonly original: infer Original } ? { readonly original: Original } : {}) &
  (Node extends { readonly key: infer Key } ? { readonly key: Key } : {}) &
  (Node extends { readonly valueStart: infer ValueStart } ? { readonly valueStart: ValueStart } : {}) &
  (Node extends { readonly valueEnd: infer ValueEnd } ? { readonly valueEnd: ValueEnd } : {})
type MarkdownNodeConstructors = {
  readonly Root: (input: MarkdownNodeInput<MarkdownRoot>) => MarkdownRoot
  readonly Paragraph: (input: MarkdownNodeInput<MarkdownParagraph>) => MarkdownParagraph
  readonly Heading: (input: MarkdownNodeInput<MarkdownHeading>) => MarkdownHeading
  readonly Text: (input: MarkdownNodeInput<MarkdownText>) => MarkdownText
  readonly Emphasis: (input: MarkdownNodeInput<MarkdownEmphasis>) => MarkdownEmphasis
  readonly Strong: (input: MarkdownNodeInput<MarkdownStrong>) => MarkdownStrong
  readonly Delete: (input: MarkdownNodeInput<MarkdownDelete>) => MarkdownDelete
  readonly InlineCode: (input: MarkdownNodeInput<MarkdownInlineCode>) => MarkdownInlineCode
  readonly Break: (input: MarkdownNodeInput<MarkdownBreak>) => MarkdownBreak
  readonly List: (input: MarkdownNodeInput<MarkdownList>) => MarkdownList
  readonly ListItem: (input: MarkdownNodeInput<MarkdownListItem>) => MarkdownListItem
  readonly Blockquote: (input: MarkdownNodeInput<MarkdownBlockquote>) => MarkdownBlockquote
  readonly Code: (input: MarkdownNodeInput<MarkdownCode>) => MarkdownCode
  readonly Html: (input: MarkdownNodeInput<MarkdownHtml>) => MarkdownHtml
  readonly Yaml: (input: MarkdownNodeInput<MarkdownYaml>) => MarkdownYaml
  readonly ThematicBreak: (input: MarkdownNodeInput<MarkdownThematicBreak>) => MarkdownThematicBreak
  readonly Link: (input: MarkdownNodeInput<MarkdownLink>) => MarkdownLink
  readonly Image: (input: MarkdownNodeInput<MarkdownImage>) => MarkdownImage
  readonly Definition: (input: MarkdownNodeInput<MarkdownDefinition>) => MarkdownDefinition
  readonly LinkReference: (input: MarkdownNodeInput<MarkdownLinkReference>) => MarkdownLinkReference
  readonly ImageReference: (input: MarkdownNodeInput<MarkdownImageReference>) => MarkdownImageReference
  readonly Table: (input: MarkdownNodeInput<MarkdownTable>) => MarkdownTable
  readonly TableRow: (input: MarkdownNodeInput<MarkdownTableRow>) => MarkdownTableRow
  readonly TableCell: (input: MarkdownNodeInput<MarkdownTableCell>) => MarkdownTableCell
  readonly FootnoteDefinition: (input: MarkdownNodeInput<MarkdownFootnoteDefinition>) => MarkdownFootnoteDefinition
  readonly FootnoteReference: (input: MarkdownNodeInput<MarkdownFootnoteReference>) => MarkdownFootnoteReference
  readonly ObsidianWikilink: (input: MarkdownNodeInput<MarkdownObsidianWikilink>) => MarkdownObsidianWikilink
  readonly ObsidianInlineField: (input: MarkdownNodeInput<MarkdownObsidianInlineField>) => MarkdownObsidianInlineField
  readonly ObsidianTag: (input: MarkdownNodeInput<MarkdownObsidianTag>) => MarkdownObsidianTag
  readonly $is: <Tag extends TagName>(tag: Tag) => (node: MarkdownNode) => node is NodeByTag<Tag>
}

const isMarkdownTag =
  <Tag extends TagName>(tag: Tag) =>
  (node: MarkdownNode): node is NodeByTag<Tag> =>
    node._tag === tag

export const MarkdownNode: MarkdownNodeConstructors = {
  Root: (input) => MarkdownRoot.make(input),
  Paragraph: (input) => MarkdownParagraph.make(input),
  Heading: (input) => MarkdownHeading.make(input),
  Text: (input) => MarkdownText.make(input),
  Emphasis: (input) => MarkdownEmphasis.make(input),
  Strong: (input) => MarkdownStrong.make(input),
  Delete: (input) => MarkdownDelete.make(input),
  InlineCode: (input) => MarkdownInlineCode.make(input),
  Break: (input) => MarkdownBreak.make(input),
  List: (input) => MarkdownList.make(input),
  ListItem: (input) => MarkdownListItem.make(input),
  Blockquote: (input) => MarkdownBlockquote.make(input),
  Code: (input) => MarkdownCode.make(input),
  Html: (input) => MarkdownHtml.make(input),
  Yaml: (input) => MarkdownYaml.make(input),
  ThematicBreak: (input) => MarkdownThematicBreak.make(input),
  Link: (input) => MarkdownLink.make(input),
  Image: (input) => MarkdownImage.make(input),
  Definition: (input) => MarkdownDefinition.make(input),
  LinkReference: (input) => MarkdownLinkReference.make(input),
  ImageReference: (input) => MarkdownImageReference.make(input),
  Table: (input) => MarkdownTable.make(input),
  TableRow: (input) => MarkdownTableRow.make(input),
  TableCell: (input) => MarkdownTableCell.make(input),
  FootnoteDefinition: (input) => MarkdownFootnoteDefinition.make(input),
  FootnoteReference: (input) => MarkdownFootnoteReference.make(input),
  ObsidianWikilink: (input) => MarkdownObsidianWikilink.make(input),
  ObsidianInlineField: (input) => MarkdownObsidianInlineField.make(input),
  ObsidianTag: (input) => MarkdownObsidianTag.make(input),
  $is: isMarkdownTag
}


export const TaggedMarkdownRootSchema = MarkdownRoot

const commonFields = (node: Node): CommonFields => {
  const fields: { position?: Position; data?: UnistData } = {}
  if (node.position !== undefined) {
    fields.position = node.position
  }
  if (node.data !== undefined) {
    fields.data = node.data
  }
  return fields
}

const optionalField = <Key extends string, Value>(
  key: Key,
  value: Value | undefined
): {} | { readonly [Property in Key]: Value } =>
  value === undefined ? {} : ({ [key]: value } as { readonly [Property in Key]: Value })

type ParentLike = Node & { readonly children: readonly Node[] }

export const isParent = (node: MarkdownNode): node is MarkdownParent =>
  "children" in node && Array.isArray(node.children)

const isParentLike = (node: Node): node is ParentLike => "children" in node && Array.isArray(node.children)

const childrenFrom = (node: Node): ReadonlyArray<MarkdownNode> =>
  isParentLike(node) ? node.children.map(decodeRawNode) : []

const referenceType = (value: LinkReference["referenceType"] | ImageReference["referenceType"]): ReferenceType => value

const decodeRawNode = (node: Node): MarkdownNode => {
  switch (node.type) {
    case "root":
      return MarkdownNode.Root({ ...commonFields(node), type: "root", children: childrenFrom(node) })
    case "paragraph":
      return MarkdownNode.Paragraph({ ...commonFields(node), type: "paragraph", children: childrenFrom(node) })
    case "heading": {
      const heading = node as Heading
      return MarkdownNode.Heading({
        ...commonFields(node),
        type: "heading",
        depth: heading.depth,
        children: childrenFrom(node)
      })
    }
    case "text": {
      const text = node as Text
      return MarkdownNode.Text({ ...commonFields(node), type: "text", value: text.value })
    }
    case "emphasis":
      return MarkdownNode.Emphasis({ ...commonFields(node), type: "emphasis", children: childrenFrom(node) })
    case "strong":
      return MarkdownNode.Strong({ ...commonFields(node), type: "strong", children: childrenFrom(node) })
    case "delete":
      return MarkdownNode.Delete({ ...commonFields(node), type: "delete", children: childrenFrom(node) })
    case "inlineCode": {
      const code = node as InlineCode
      return MarkdownNode.InlineCode({ ...commonFields(node), type: "inlineCode", value: code.value })
    }
    case "break":
      return MarkdownNode.Break({ ...commonFields(node), type: "break" })
    case "list": {
      const list = node as List
      return MarkdownNode.List({
        ...commonFields(node),
        type: "list",
        ...optionalField("ordered", list.ordered),
        ...optionalField("start", list.start),
        ...optionalField("spread", list.spread),
        children: childrenFrom(node)
      })
    }
    case "listItem": {
      const item = node as ListItem
      return MarkdownNode.ListItem({
        ...commonFields(node),
        type: "listItem",
        ...optionalField("checked", item.checked),
        ...optionalField("spread", item.spread),
        children: childrenFrom(node)
      })
    }
    case "blockquote":
      return MarkdownNode.Blockquote({ ...commonFields(node), type: "blockquote", children: childrenFrom(node) })
    case "code": {
      const code = node as Code
      return MarkdownNode.Code({
        ...commonFields(node),
        type: "code",
        value: code.value,
        ...optionalField("lang", code.lang),
        ...optionalField("meta", code.meta)
      })
    }
    case "html": {
      const html = node as Html
      return MarkdownNode.Html({ ...commonFields(node), type: "html", value: html.value })
    }
    case "yaml": {
      const yaml = node as Yaml
      return MarkdownNode.Yaml({ ...commonFields(node), type: "yaml", value: yaml.value })
    }
    case "thematicBreak":
      return MarkdownNode.ThematicBreak({ ...commonFields(node), type: "thematicBreak" })
    case "link": {
      const link = node as Link
      return MarkdownNode.Link({
        ...commonFields(node),
        type: "link",
        url: link.url,
        ...optionalField("title", link.title),
        children: childrenFrom(node)
      })
    }
    case "image": {
      const image = node as Image
      return MarkdownNode.Image({
        ...commonFields(node),
        type: "image",
        url: image.url,
        ...optionalField("alt", image.alt),
        ...optionalField("title", image.title)
      })
    }
    case "definition": {
      const definition = node as Definition
      return MarkdownNode.Definition({
        ...commonFields(node),
        type: "definition",
        identifier: definition.identifier,
        ...optionalField("label", definition.label),
        url: definition.url,
        ...optionalField("title", definition.title)
      })
    }
    case "linkReference": {
      const link = node as LinkReference
      return MarkdownNode.LinkReference({
        ...commonFields(node),
        type: "linkReference",
        identifier: link.identifier,
        ...optionalField("label", link.label),
        referenceType: referenceType(link.referenceType),
        children: childrenFrom(node)
      })
    }
    case "imageReference": {
      const image = node as ImageReference
      return MarkdownNode.ImageReference({
        ...commonFields(node),
        type: "imageReference",
        identifier: image.identifier,
        ...optionalField("label", image.label),
        referenceType: referenceType(image.referenceType),
        ...optionalField("alt", image.alt)
      })
    }
    case "table": {
      const table = node as Table
      return MarkdownNode.Table({
        ...commonFields(node),
        type: "table",
        ...optionalField("align", table.align),
        children: childrenFrom(node)
      })
    }
    case "tableRow":
      return MarkdownNode.TableRow({ ...commonFields(node), type: "tableRow", children: childrenFrom(node) })
    case "tableCell":
      return MarkdownNode.TableCell({ ...commonFields(node), type: "tableCell", children: childrenFrom(node) })
    case "footnoteDefinition": {
      const footnote = node as FootnoteDefinition
      return MarkdownNode.FootnoteDefinition({
        ...commonFields(node),
        type: "footnoteDefinition",
        identifier: footnote.identifier,
        ...optionalField("label", footnote.label),
        children: childrenFrom(node)
      })
    }
    case "footnoteReference": {
      const footnote = node as FootnoteReference
      return MarkdownNode.FootnoteReference({
        ...commonFields(node),
        type: "footnoteReference",
        identifier: footnote.identifier,
        ...optionalField("label", footnote.label)
      })
    }
    case "obsidianWikilink": {
      const wikilink = node as ObsidianWikilink
      return MarkdownNode.ObsidianWikilink({
        ...commonFields(node),
        type: "obsidianWikilink",
        value: wikilink.value,
        target: wikilink.target,
        ...optionalField("alias", wikilink.alias),
        ...optionalField("heading", wikilink.heading),
        ...optionalField("block", wikilink.block),
        original: wikilink.original
      })
    }
    case "obsidianInlineField": {
      const field = node as ObsidianInlineField
      return MarkdownNode.ObsidianInlineField({
        ...commonFields(node),
        type: "obsidianInlineField",
        value: field.value,
        key: field.key,
        original: field.original,
        valueStart: field.valueStart,
        valueEnd: field.valueEnd
      })
    }
    case "obsidianTag": {
      const tag = node as ObsidianTag
      return MarkdownNode.ObsidianTag({
        ...commonFields(node),
        type: "obsidianTag",
        value: tag.value,
        original: tag.original
      })
    }
    default:
      return node as unknown as MarkdownNode
  }
}

const encodeNodeToMdast = (node: MarkdownNode): Node => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === "_tag" || value === undefined) {
      continue
    }
    out[key] =
      key === "children" && Array.isArray(value)
        ? value.map((child) => encodeNodeToMdast(child as MarkdownNode))
        : value
  }
  return out as unknown as Node
}

const MdastNodeSchema = Schema.Any as Schema.Codec<Node, Node>
const MdastRootSchema = Schema.Any as Schema.Codec<Root, Root>

export const MarkdownNodeSchema: Schema.Codec<MarkdownNode, Node> = MdastNodeSchema.pipe(
  Schema.decodeTo(
    TaggedMarkdownNodeSchema,
    SchemaTransformation.transform({
      decode: (node: unknown): MarkdownNode => decodeRawNode(node as Node),
      encode: (node: MarkdownNode): Node => encodeNodeToMdast(node)
    })
  )
)

export const MarkdownRootSchema: Schema.Codec<MarkdownRoot, Root> = MdastRootSchema.pipe(
  Schema.decodeTo(
    TaggedMarkdownRootSchema,
    SchemaTransformation.transform({
      decode: (root: unknown): MarkdownRoot => decodeRawNode(root as Root) as MarkdownRoot,
      encode: (root: MarkdownRoot): Root => encodeNodeToMdast(root) as Root
    })
  )
)

export const decodeMdast = (root: Root): MarkdownRoot => Schema.decodeUnknownSync(MarkdownRootSchema)(root)

export const encodeMdast = (root: MarkdownRoot): Root => Schema.encodeSync(MarkdownRootSchema)(root) as Root

export const fromMdast = decodeMdast
