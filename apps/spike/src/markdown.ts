import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from "effect"
import * as Yaml from "yaml"

const PREFIX = "Markdown"

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

// Base Classes
export const Position = Schema.Struct({
  line: PositiveInteger,
  column: PositiveInteger,
  offset: PositiveInteger
})

export class BaseNode extends Schema.Class<BaseNode>(`${PREFIX}BaseNode`)({
  type: Schema.String,
  position: Schema.Struct({
    start: Position,
    end: Position
  })
}) {}

export class ParentNode extends BaseNode.extend<ParentNode>(`${PREFIX}ParentNode`)({
  children: Schema.Array(Schema.suspend(() => AnyNode))
}) {}

export class LiteralNode extends BaseNode.extend<LiteralNode>(`${PREFIX}LiteralNode`)({
  value: Schema.Unknown
}) {}

// Union Types
export const BlockContentNode: Schema.Codec<BaseNode> = Schema.Union([
  Schema.suspend(() => BlockquoteNode),
  Schema.suspend(() => CodeNode),
  Schema.suspend(() => HeadingNode),
  Schema.suspend(() => HtmlNode),
  Schema.suspend(() => ListNode),
  Schema.suspend(() => ParagraphNode),
  Schema.suspend(() => TableNode),
  Schema.suspend(() => ThematicBreakNode)
])

export const DefinitionContentNode: Schema.Codec<BaseNode> = Schema.Union([
  Schema.suspend(() => DefinitionNode),
  Schema.suspend(() => FootnoteDefinitionNode)
])

export const ListContentNode: Schema.Codec<BaseNode> = Schema.suspend(() => ListItemNode)

export const PhrasingContentNode: Schema.Codec<BaseNode> = Schema.Union([
  Schema.suspend(() => BreakNode),
  Schema.suspend(() => DeleteNode),
  Schema.suspend(() => EmphasisNode),
  Schema.suspend(() => FootnoteReferenceNode),
  Schema.suspend(() => HtmlNode),
  Schema.suspend(() => ImageNode),
  Schema.suspend(() => ImageReferenceNode),
  Schema.suspend(() => InlineCodeNode),
  Schema.suspend(() => LinkNode),
  Schema.suspend(() => LinkReferenceNode),
  Schema.suspend(() => StrongNode),
  Schema.suspend(() => TextNode)
])

export const RootContentNode: Schema.Codec<BaseNode> = Schema.Union([
  Schema.suspend(() => BlockquoteNode),
  Schema.suspend(() => BreakNode),
  Schema.suspend(() => CodeNode),
  Schema.suspend(() => DefinitionNode),
  Schema.suspend(() => DeleteNode),
  Schema.suspend(() => EmphasisNode),
  Schema.suspend(() => FootnoteDefinitionNode),
  Schema.suspend(() => FootnoteReferenceNode),
  Schema.suspend(() => HeadingNode),
  Schema.suspend(() => HtmlNode),
  Schema.suspend(() => ImageNode),
  Schema.suspend(() => ImageReferenceNode),
  Schema.suspend(() => InlineCodeNode),
  Schema.suspend(() => LinkNode),
  Schema.suspend(() => LinkReferenceNode),
  Schema.suspend(() => ListNode),
  Schema.suspend(() => ListItemNode),
  Schema.suspend(() => ParagraphNode),
  Schema.suspend(() => StrongNode),
  Schema.suspend(() => TableNode),
  Schema.suspend(() => TableCellNode),
  Schema.suspend(() => TableRowNode),
  Schema.suspend(() => TextNode),
  Schema.suspend(() => ThematicBreakNode),
  Schema.suspend(() => YamlFrontmatterNode)
])

export const RowContentNode: Schema.Codec<BaseNode> = Schema.suspend(() => TableCellNode)

export const TableContentNode: Schema.Codec<BaseNode> = Schema.suspend(() => TableRowNode)

export const AnyNode: Schema.Codec<BaseNode> = Schema.Union([
  Schema.suspend(() => BlockquoteNode),
  Schema.suspend(() => BreakNode),
  Schema.suspend(() => CodeNode),
  Schema.suspend(() => DefinitionNode),
  Schema.suspend(() => DeleteNode),
  Schema.suspend(() => EmphasisNode),
  Schema.suspend(() => FootnoteDefinitionNode),
  Schema.suspend(() => FootnoteReferenceNode),
  Schema.suspend(() => HeadingNode),
  Schema.suspend(() => HtmlNode),
  Schema.suspend(() => ImageNode),
  Schema.suspend(() => ImageReferenceNode),
  Schema.suspend(() => InlineCodeNode),
  Schema.suspend(() => LinkNode),
  Schema.suspend(() => LinkReferenceNode),
  Schema.suspend(() => ListNode),
  Schema.suspend(() => ListItemNode),
  Schema.suspend(() => ParagraphNode),
  Schema.suspend(() => Root),
  Schema.suspend(() => StrongNode),
  Schema.suspend(() => TableNode),
  Schema.suspend(() => TableCellNode),
  Schema.suspend(() => TableRowNode),
  Schema.suspend(() => TextNode),
  Schema.suspend(() => ThematicBreakNode),
  Schema.suspend(() => YamlFrontmatterNode)
])

export class Root extends ParentNode.extend<Root>(`${PREFIX}Root`)({
  type: Schema.tag("root"),
  children: Schema.Array(Schema.suspend(() => RootContentNode))
}) {}

// Concrete Nodes
export class BlockquoteNode extends ParentNode.extend<BlockquoteNode>(`${PREFIX}BlockquoteNode`)({
  type: Schema.tag("blockquote"),
  children: Schema.Array(Schema.suspend(() => Schema.Union([BlockContentNode, DefinitionContentNode])))
}) {}

export class BreakNode extends BaseNode.extend<BreakNode>(`${PREFIX}BreakNode`)({
  type: Schema.tag("break")
}) {}

export class CodeNode extends LiteralNode.extend<CodeNode>(`${PREFIX}CodeNode`)({
  type: Schema.tag("code"),
  value: Schema.String,
  lang: Schema.String.pipe(Schema.OptionFromNullishOr),
  meta: Schema.String.pipe(Schema.OptionFromNullishOr)
}) {}

export class DefinitionNode extends BaseNode.extend<DefinitionNode>(`${PREFIX}DefinitionNode`)({
  type: Schema.tag("definition"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr),
  url: Schema.String,
  title: Schema.String.pipe(Schema.OptionFromNullishOr)
}) {}

export class DeleteNode extends ParentNode.extend<DeleteNode>(`${PREFIX}DeleteNode`)({
  type: Schema.tag("delete"),
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

export class EmphasisNode extends ParentNode.extend<EmphasisNode>(`${PREFIX}EmphasisNode`)({
  type: Schema.tag("emphasis"),
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

export class FootnoteDefinitionNode extends ParentNode.extend<FootnoteDefinitionNode>(
  `${PREFIX}FootnoteDefinitionNode`
)({
  type: Schema.tag("footnoteDefinition"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr),
  children: Schema.Array(Schema.suspend(() => Schema.Union([BlockContentNode, DefinitionContentNode])))
}) {}

export class FootnoteReferenceNode extends BaseNode.extend<FootnoteReferenceNode>(`${PREFIX}FootnoteReferenceNode`)({
  type: Schema.tag("footnoteReference"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr)
}) {}

export const HeadingLevel = Schema.Literals([1, 2, 3, 4, 5, 6])
export class HeadingNode extends ParentNode.extend<HeadingNode>(`${PREFIX}HeadingNode`)({
  type: Schema.tag("heading"),
  depth: HeadingLevel,
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

export class HtmlNode extends LiteralNode.extend<HtmlNode>(`${PREFIX}HtmlNode`)({
  type: Schema.tag("html"),
  value: Schema.String
}) {}

export class ImageNode extends BaseNode.extend<ImageNode>(`${PREFIX}ImageNode`)({
  type: Schema.tag("image"),
  url: Schema.String,
  title: Schema.String.pipe(Schema.OptionFromNullishOr),
  alt: Schema.String.pipe(Schema.OptionFromNullishOr)
}) {}

export const ReferenceType = Schema.Literals(["shortcut", "collapsed", "full"])
export class ImageReferenceNode extends BaseNode.extend<ImageReferenceNode>(`${PREFIX}ImageReferenceNode`)({
  type: Schema.tag("imageReference"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr),
  referenceType: ReferenceType,
  alt: Schema.String.pipe(Schema.OptionFromNullishOr)
}) {}

export class InlineCodeNode extends LiteralNode.extend<InlineCodeNode>(`${PREFIX}InlineCodeNode`)({
  type: Schema.tag("inlineCode"),
  value: Schema.String
}) {}

export class LinkNode extends ParentNode.extend<LinkNode>(`${PREFIX}LinkNode`)({
  type: Schema.tag("link"),
  url: Schema.String,
  title: Schema.String.pipe(Schema.OptionFromNullishOr),
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

export class LinkReferenceNode extends ParentNode.extend<LinkReferenceNode>(`${PREFIX}LinkReferenceNode`)({
  type: Schema.tag("linkReference"),
  identifier: Schema.String,
  label: Schema.String.pipe(Schema.OptionFromNullishOr),
  referenceType: ReferenceType,
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

export class ListNode extends ParentNode.extend<ListNode>(`${PREFIX}ListNode`)({
  type: Schema.tag("list"),
  children: Schema.Array(Schema.suspend(() => ListContentNode)),
  ordered: Schema.Boolean.pipe(Schema.OptionFromNullishOr),
  start: Schema.Number.pipe(Schema.OptionFromNullishOr),
  spread: Schema.Boolean.pipe(Schema.OptionFromNullishOr)
}) {}

export class ListItemNode extends ParentNode.extend<ListItemNode>(`${PREFIX}ListItemNode`)({
  type: Schema.tag("listItem"),
  children: Schema.Array(Schema.suspend(() => Schema.Union([BlockContentNode, DefinitionContentNode]))),
  checked: Schema.Boolean.pipe(Schema.OptionFromNullishOr),
  spread: Schema.Boolean.pipe(Schema.OptionFromNullishOr)
}) {}

export class ParagraphNode extends ParentNode.extend<ParagraphNode>(`${PREFIX}ParagraphNode`)({
  type: Schema.tag("paragraph"),
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

export class StrongNode extends ParentNode.extend<StrongNode>(`${PREFIX}StrongNode`)({
  type: Schema.tag("strong"),
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

export const AlignType = Schema.Literals(["center", "left", "right"])
export class TableNode extends ParentNode.extend<TableNode>(`${PREFIX}TableNode`)({
  type: Schema.tag("table"),
  align: Schema.Array(AlignType).pipe(Schema.OptionFromNullishOr),
  children: Schema.Array(Schema.suspend(() => TableContentNode))
}) {}

export class TableCellNode extends ParentNode.extend<TableCellNode>(`${PREFIX}TableCellNode`)({
  type: Schema.tag("tableCell"),
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

export class TableRowNode extends ParentNode.extend<TableRowNode>(`${PREFIX}TableRowNode`)({
  type: Schema.tag("tableRow"),
  children: Schema.Array(Schema.suspend(() => RowContentNode))
}) {}

export class TextNode extends LiteralNode.extend<TextNode>(`${PREFIX}TextNode`)({
  type: Schema.tag("text"),
  value: Schema.String
}) {}

export class ThematicBreakNode extends BaseNode.extend<ThematicBreakNode>(`${PREFIX}ThematicBreakNode`)({
  type: Schema.tag("thematicBreak")
}) {}

export class YamlFrontmatterNode extends LiteralNode.extend<YamlFrontmatterNode>(`${PREFIX}YamlFrontmatterNode`)({
  type: Schema.tag("yaml"),
  value: UnknownFromYamlString
}) {}
