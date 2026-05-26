import type {
  Code,
  Definition,
  FootnoteDefinition,
  FootnoteReference,
  Heading,
  Html,
  Image,
  ImageReference,
  InlineCode,
  Link,
  LinkReference,
  List,
  ListItem,
  Root,
  Table,
  Text,
  Yaml
} from "mdast"
import type { Data as UnistData, Node, Position } from "unist"
import { Data } from "effect"

import type { ObsidianInlineField, ObsidianTag, ObsidianWikilink } from "@kb/remark-obsidian"

type ReferenceType = "shortcut" | "collapsed" | "full"
type AlignType = "left" | "right" | "center" | null

type CommonFields = {
  position?: Position
  data?: UnistData
}

type LiteralFields<Type extends string, Value = string> = CommonFields & {
  type: Type
  value: Value
}

type ParentFields<Type extends string, Children extends ReadonlyArray<unknown>> = CommonFields & {
  type: Type
  children: Children
}

type MarkdownNodeShape<Child> = Data.TaggedEnum<{
  Root: ParentFields<"root", ReadonlyArray<Child>>
  Paragraph: ParentFields<"paragraph", ReadonlyArray<Child>>
  Heading: ParentFields<"heading", ReadonlyArray<Child>> & { depth: Heading["depth"] }
  Text: LiteralFields<"text">
  Emphasis: ParentFields<"emphasis", ReadonlyArray<Child>>
  Strong: ParentFields<"strong", ReadonlyArray<Child>>
  Delete: ParentFields<"delete", ReadonlyArray<Child>>
  InlineCode: LiteralFields<"inlineCode">
  Break: CommonFields & { type: "break" }
  List: ParentFields<"list", ReadonlyArray<Child>> & {
    ordered?: boolean | null | undefined
    start?: number | null | undefined
    spread?: boolean | null | undefined
  }
  ListItem: ParentFields<"listItem", ReadonlyArray<Child>> & {
    checked?: boolean | null | undefined
    spread?: boolean | null | undefined
  }
  Blockquote: ParentFields<"blockquote", ReadonlyArray<Child>>
  Code: LiteralFields<"code"> & {
    lang?: string | null | undefined
    meta?: string | null | undefined
  }
  Html: LiteralFields<"html">
  Yaml: LiteralFields<"yaml">
  ThematicBreak: CommonFields & { type: "thematicBreak" }
  Link: ParentFields<"link", ReadonlyArray<Child>> & {
    url: string
    title?: string | null | undefined
  }
  Image: CommonFields & {
    type: "image"
    url: string
    alt?: string | null | undefined
    title?: string | null | undefined
  }
  Definition: CommonFields & {
    type: "definition"
    identifier: string
    label?: string | null | undefined
    url: string
    title?: string | null | undefined
  }
  LinkReference: ParentFields<"linkReference", ReadonlyArray<Child>> & {
    identifier: string
    label?: string | null | undefined
    referenceType: ReferenceType
  }
  ImageReference: CommonFields & {
    type: "imageReference"
    identifier: string
    label?: string | null | undefined
    referenceType: ReferenceType
    alt?: string | null | undefined
  }
  Table: ParentFields<"table", ReadonlyArray<Child>> & {
    align?: ReadonlyArray<AlignType> | null | undefined
  }
  TableRow: ParentFields<"tableRow", ReadonlyArray<Child>>
  TableCell: ParentFields<"tableCell", ReadonlyArray<Child>>
  FootnoteDefinition: ParentFields<"footnoteDefinition", ReadonlyArray<Child>> & {
    identifier: string
    label?: string | null | undefined
  }
  FootnoteReference: CommonFields & {
    type: "footnoteReference"
    identifier: string
    label?: string | null | undefined
  }
  ObsidianWikilink: LiteralFields<"obsidianWikilink"> & {
    target: string
    alias?: string | undefined
    heading?: string | undefined
    block?: string | undefined
    original: string
  }
  ObsidianInlineField: LiteralFields<"obsidianInlineField"> & {
    key: string
    original: string
    valueStart: number
    valueEnd: number
  }
  ObsidianTag: LiteralFields<"obsidianTag"> & {
    original: string
  }
}>

export interface MarkdownRoot extends ParentFields<"root", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Root"
}
export interface MarkdownParagraph extends ParentFields<"paragraph", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Paragraph"
}
export interface MarkdownHeading extends ParentFields<"heading", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Heading"
  readonly depth: Heading["depth"]
}
export interface MarkdownText extends LiteralFields<"text"> {
  readonly _tag: "Text"
}
export interface MarkdownEmphasis extends ParentFields<"emphasis", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Emphasis"
}
export interface MarkdownStrong extends ParentFields<"strong", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Strong"
}
export interface MarkdownDelete extends ParentFields<"delete", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Delete"
}
export interface MarkdownInlineCode extends LiteralFields<"inlineCode"> {
  readonly _tag: "InlineCode"
}
export interface MarkdownBreak extends CommonFields {
  readonly _tag: "Break"
  readonly type: "break"
}
export interface MarkdownList extends ParentFields<"list", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "List"
  readonly ordered?: boolean | null | undefined
  readonly start?: number | null | undefined
  readonly spread?: boolean | null | undefined
}
export interface MarkdownListItem extends ParentFields<"listItem", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "ListItem"
  readonly checked?: boolean | null | undefined
  readonly spread?: boolean | null | undefined
}
export interface MarkdownBlockquote extends ParentFields<"blockquote", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Blockquote"
}
export interface MarkdownCode extends LiteralFields<"code"> {
  readonly _tag: "Code"
  readonly lang?: string | null | undefined
  readonly meta?: string | null | undefined
}
export interface MarkdownHtml extends LiteralFields<"html"> {
  readonly _tag: "Html"
}
export interface MarkdownYaml extends LiteralFields<"yaml"> {
  readonly _tag: "Yaml"
}
export interface MarkdownThematicBreak extends CommonFields {
  readonly _tag: "ThematicBreak"
  readonly type: "thematicBreak"
}
export interface MarkdownLink extends ParentFields<"link", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Link"
  readonly url: string
  readonly title?: string | null | undefined
}
export interface MarkdownImage extends CommonFields {
  readonly _tag: "Image"
  readonly type: "image"
  readonly url: string
  readonly alt?: string | null | undefined
  readonly title?: string | null | undefined
}
export interface MarkdownDefinition extends CommonFields {
  readonly _tag: "Definition"
  readonly type: "definition"
  readonly identifier: string
  readonly label?: string | null | undefined
  readonly url: string
  readonly title?: string | null | undefined
}
export interface MarkdownLinkReference extends ParentFields<"linkReference", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "LinkReference"
  readonly identifier: string
  readonly label?: string | null | undefined
  readonly referenceType: ReferenceType
}
export interface MarkdownImageReference extends CommonFields {
  readonly _tag: "ImageReference"
  readonly type: "imageReference"
  readonly identifier: string
  readonly label?: string | null | undefined
  readonly referenceType: ReferenceType
  readonly alt?: string | null | undefined
}
export interface MarkdownTable extends ParentFields<"table", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "Table"
  readonly align?: ReadonlyArray<AlignType> | null | undefined
}
export interface MarkdownTableRow extends ParentFields<"tableRow", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "TableRow"
}
export interface MarkdownTableCell extends ParentFields<"tableCell", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "TableCell"
}
export interface MarkdownFootnoteDefinition extends ParentFields<"footnoteDefinition", ReadonlyArray<MarkdownNode>> {
  readonly _tag: "FootnoteDefinition"
  readonly identifier: string
  readonly label?: string | null | undefined
}
export interface MarkdownFootnoteReference extends CommonFields {
  readonly _tag: "FootnoteReference"
  readonly type: "footnoteReference"
  readonly identifier: string
  readonly label?: string | null | undefined
}
export interface MarkdownObsidianWikilink extends LiteralFields<"obsidianWikilink"> {
  readonly _tag: "ObsidianWikilink"
  readonly target: string
  readonly alias?: string | undefined
  readonly heading?: string | undefined
  readonly block?: string | undefined
  readonly original: string
}
export interface MarkdownObsidianInlineField extends LiteralFields<"obsidianInlineField"> {
  readonly _tag: "ObsidianInlineField"
  readonly key: string
  readonly original: string
  readonly valueStart: number
  readonly valueEnd: number
}
export interface MarkdownObsidianTag extends LiteralFields<"obsidianTag"> {
  readonly _tag: "ObsidianTag"
  readonly original: string
}

export type MarkdownNode =
  | MarkdownRoot
  | MarkdownParagraph
  | MarkdownHeading
  | MarkdownText
  | MarkdownEmphasis
  | MarkdownStrong
  | MarkdownDelete
  | MarkdownInlineCode
  | MarkdownBreak
  | MarkdownList
  | MarkdownListItem
  | MarkdownBlockquote
  | MarkdownCode
  | MarkdownHtml
  | MarkdownYaml
  | MarkdownThematicBreak
  | MarkdownLink
  | MarkdownImage
  | MarkdownDefinition
  | MarkdownLinkReference
  | MarkdownImageReference
  | MarkdownTable
  | MarkdownTableRow
  | MarkdownTableCell
  | MarkdownFootnoteDefinition
  | MarkdownFootnoteReference
  | MarkdownObsidianWikilink
  | MarkdownObsidianInlineField
  | MarkdownObsidianTag

export const MarkdownNode: Data.TaggedEnum.Constructor<MarkdownNodeShape<MarkdownNode>> = Data.taggedEnum<MarkdownNodeShape<MarkdownNode>>()

export type MarkdownParent = Extract<MarkdownNode, { readonly children: ReadonlyArray<MarkdownNode> }>

const commonFields = (node: Node): CommonFields => {
  const fields: CommonFields = {}
  if (node.position !== undefined) {
    fields.position = node.position
  }
  if (node.data !== undefined) {
    fields.data = node.data
  }
  return fields
}

type ParentLike = Node & { readonly children: readonly Node[] }

export const isParent = (node: MarkdownNode): node is MarkdownParent =>
  "children" in node && Array.isArray(node.children)

const isParentLike = (node: Node): node is ParentLike =>
  "children" in node && Array.isArray(node.children)

const childrenFrom = (node: Node): ReadonlyArray<MarkdownNode> =>
  isParentLike(node) ? node.children.map(convertNode) : []

const referenceType = (value: LinkReference["referenceType"] | ImageReference["referenceType"]): ReferenceType => value

const convertNode = (node: Node): MarkdownNode => {
  switch (node.type) {
    case "root": {
      return MarkdownNode.Root({ ...commonFields(node), type: "root", children: childrenFrom(node) })
    }
    case "paragraph": {
      return MarkdownNode.Paragraph({ ...commonFields(node), type: "paragraph", children: childrenFrom(node) })
    }
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
    case "emphasis": {
      return MarkdownNode.Emphasis({ ...commonFields(node), type: "emphasis", children: childrenFrom(node) })
    }
    case "strong": {
      return MarkdownNode.Strong({ ...commonFields(node), type: "strong", children: childrenFrom(node) })
    }
    case "delete": {
      return MarkdownNode.Delete({ ...commonFields(node), type: "delete", children: childrenFrom(node) })
    }
    case "inlineCode": {
      const code = node as InlineCode
      return MarkdownNode.InlineCode({ ...commonFields(node), type: "inlineCode", value: code.value })
    }
    case "break": {
      return MarkdownNode.Break({ ...commonFields(node), type: "break" })
    }
    case "list": {
      const list = node as List
      return MarkdownNode.List({
        ...commonFields(node),
        type: "list",
        ordered: list.ordered,
        start: list.start,
        spread: list.spread,
        children: childrenFrom(node)
      })
    }
    case "listItem": {
      const item = node as ListItem
      return MarkdownNode.ListItem({
        ...commonFields(node),
        type: "listItem",
        checked: item.checked,
        spread: item.spread,
        children: childrenFrom(node)
      })
    }
    case "blockquote": {
      return MarkdownNode.Blockquote({ ...commonFields(node), type: "blockquote", children: childrenFrom(node) })
    }
    case "code": {
      const code = node as Code
      return MarkdownNode.Code({
        ...commonFields(node),
        type: "code",
        value: code.value,
        lang: code.lang,
        meta: code.meta
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
    case "thematicBreak": {
      return MarkdownNode.ThematicBreak({ ...commonFields(node), type: "thematicBreak" })
    }
    case "link": {
      const link = node as Link
      return MarkdownNode.Link({
        ...commonFields(node),
        type: "link",
        url: link.url,
        title: link.title,
        children: childrenFrom(node)
      })
    }
    case "image": {
      const image = node as Image
      return MarkdownNode.Image({
        ...commonFields(node),
        type: "image",
        url: image.url,
        alt: image.alt,
        title: image.title
      })
    }
    case "definition": {
      const definition = node as Definition
      return MarkdownNode.Definition({
        ...commonFields(node),
        type: "definition",
        identifier: definition.identifier,
        label: definition.label,
        url: definition.url,
        title: definition.title
      })
    }
    case "linkReference": {
      const link = node as LinkReference
      return MarkdownNode.LinkReference({
        ...commonFields(node),
        type: "linkReference",
        identifier: link.identifier,
        label: link.label,
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
        label: image.label,
        referenceType: referenceType(image.referenceType),
        alt: image.alt
      })
    }
    case "table": {
      const table = node as Table
      return MarkdownNode.Table({
        ...commonFields(node),
        type: "table",
        align: table.align,
        children: childrenFrom(node)
      })
    }
    case "tableRow": {
      return MarkdownNode.TableRow({ ...commonFields(node), type: "tableRow", children: childrenFrom(node) })
    }
    case "tableCell": {
      return MarkdownNode.TableCell({ ...commonFields(node), type: "tableCell", children: childrenFrom(node) })
    }
    case "footnoteDefinition": {
      const footnote = node as FootnoteDefinition
      return MarkdownNode.FootnoteDefinition({
        ...commonFields(node),
        type: "footnoteDefinition",
        identifier: footnote.identifier,
        label: footnote.label,
        children: childrenFrom(node)
      })
    }
    case "footnoteReference": {
      const footnote = node as FootnoteReference
      return MarkdownNode.FootnoteReference({
        ...commonFields(node),
        type: "footnoteReference",
        identifier: footnote.identifier,
        label: footnote.label
      })
    }
    case "obsidianWikilink": {
      const wikilink = node as ObsidianWikilink
      return MarkdownNode.ObsidianWikilink({
        ...commonFields(node),
        type: "obsidianWikilink",
        value: wikilink.value,
        target: wikilink.target,
        alias: wikilink.alias,
        heading: wikilink.heading,
        block: wikilink.block,
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
    default: {
      const fallback = node as Text
      return MarkdownNode.Text({ ...commonFields(node), type: "text", value: fallback.value ?? "" })
    }
  }
}

export const fromMdast = (root: Root): MarkdownRoot => MarkdownNode.Root({
  ...commonFields(root),
  type: "root",
  children: root.children.map(convertNode)
})
