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

export class Root extends ParentNode.extend<Root>(`${PREFIX}Root`)({
  type: Schema.tag("root"),
  children: Schema.Array(Schema.suspend(() => RootContentNode))
}) {}

// Checked
export class YamlFrontmatterNode extends LiteralNode.extend<YamlFrontmatterNode>(`${PREFIX}YamlFrontmatterNode`)({
  type: Schema.tag("yaml"),
  value: UnknownFromYamlString
}) {}

// Checked
export class TextNode extends LiteralNode.extend<TextNode>(`${PREFIX}TextNode`)({
  type: Schema.tag("text"),
  value: Schema.String
}) {}

// checked
export class ParagraphNode extends ParentNode.extend<ParagraphNode>(`${PREFIX}Paragraph`)({
  type: Schema.tag("paragraph"),
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

// checked
export const HeadingLevel = Schema.Literals([1, 2, 3, 4, 5, 6])
export class HeadingNode extends ParentNode.extend<HeadingNode>(`${PREFIX}HeadingNode`)({
  type: Schema.tag("heading"),
  depth: HeadingLevel,
  children: Schema.Array(Schema.suspend(() => PhrasingContentNode))
}) {}

// checked
export class ListNode extends ParentNode.extend<ListNode>(`${PREFIX}ListNode`)({
  type: Schema.tag("list"),
  children: Schema.Array(Schema.suspend(() => ListContentNode)),
  ordered: Schema.Boolean.pipe(Schema.OptionFromNullishOr),
  start: Schema.Number.pipe(Schema.OptionFromNullishOr),
  // technically null/undefined -> false
  spread: Schema.Boolean.pipe(Schema.OptionFromNullishOr)
}) {}

// checked
export class ListItemNode extends ParentNode.extend<ListItemNode>(`${PREFIX}ListItemNode`)({
  type: Schema.tag("listItem"),
  children: Schema.Array(Schema.suspend(() => Schema.Union([BlockContentNode, DefinitionContentNode]))),
  // boolean if tasklist item. nullish otherwise
  checked: Schema.Boolean.pipe(Schema.OptionFromNullishOr),
  // technically null/undefined -> false
  spread: Schema.Boolean.pipe(Schema.OptionFromNullishOr)
}) {}

// Union Types below
export const PhrasingContentNode: Schema.Codec<BaseNode> = Schema.Union([
  // break: Break;
  // delete: Delete;
  // emphasis: Emphasis;
  // footnoteReference: FootnoteReference;
  // html: Html;
  // image: Image;
  // imageReference: ImageReference;
  // inlineCode: InlineCode;
  // link: Link;
  // linkReference: LinkReference;
  // strong: Strong;
  TextNode
])

export const BlockContentNode: Schema.Codec<BaseNode> = Schema.Union([
  // blockquote: Blockquote;
  // code: Code;
  // heading: Heading;
  // html: Html;
  ListNode,
  ParagraphNode
  // table: Table;
  // thematicBreak: ThematicBreak;
])

export const DefinitionContentNode: Schema.Codec<BaseNode> = Schema.Union([
  // definition: Definition;
  // footnoteDefinition: FootnoteDefinition;
])

export const ListContentNode = ListItemNode

export const RootContentNode = Schema.Union([
  // blockquote: Blockquote;
  // break: Break;
  // code: Code;
  // definition: Definition;
  // delete: Delete;
  // emphasis: Emphasis;
  // footnoteDefinition: FootnoteDefinition;
  // footnoteReference: FootnoteReference;
  HeadingNode,
  // html: Html;
  // image: Image;
  // imageReference: ImageReference;
  // inlineCode: InlineCode;
  // link: Link;
  // linkReference: LinkReference;
  ListNode,
  ListItemNode,
  ParagraphNode,
  // strong: Strong;
  // table: Table;
  // tableCell: TableCell;
  // tableRow: TableRow;
  TextNode,
  // thematicBreak: ThematicBreak;
  YamlFrontmatterNode
])

export const AnyNode: Schema.Codec<BaseNode> = Schema.Union([
  YamlFrontmatterNode,
  TextNode,
  HeadingNode,
  ParagraphNode,
  BaseNode,
  ListNode
])
