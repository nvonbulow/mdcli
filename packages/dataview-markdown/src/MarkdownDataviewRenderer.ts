import {
  MarkdownProcessor,
  type AnyNode,
  type CodeNode,
  type MarkdownParseError,
  type MarkdownStringifyError,
  type ParagraphNode,
  type Root,
  type TableCellNode,
  type TableNode,
  type TableRowNode,
  type TextNode,
  mapEffect
} from "@kb/markdown-ast"
import {
  DataviewProgram,
  type DataviewEvaluateError,
  type DataviewParseError,
  type DataviewRecordSourceError,
  type DataviewResult,
  type DataviewValue
} from "@kb/dataview"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

export type MarkdownDataviewRendererService = {
  readonly renderDocument: (
    markdown: string
  ) => Effect.Effect<
    string,
    | MarkdownParseError
    | MarkdownStringifyError
    | DataviewParseError
    | DataviewEvaluateError
    | DataviewRecordSourceError
  >
}

export class MarkdownDataviewRenderer extends Context.Service<
  MarkdownDataviewRenderer,
  MarkdownDataviewRendererService
>()("@kb/dataview-markdown/MarkdownDataviewRenderer") {
  static readonly layerNoDeps: Layer.Layer<
    MarkdownDataviewRenderer,
    never,
    DataviewProgram
  > = Layer.effect(
    this,
    Effect.gen(function* () {
      const markdown = yield* MarkdownProcessor
      const program = yield* DataviewProgram
      return MarkdownDataviewRenderer.of({
        renderDocument: Effect.fn("MarkdownDataviewRenderer.renderDocument")(function* (markdownDocument: string) {
          const root = yield* markdown.parse(markdownDocument)
          const transformed = yield* transformDataviewBlocks(root, program)
          return yield* markdown.stringify(transformed)
        })
      })
    })
  ).pipe(Layer.provide(MarkdownProcessor.layer))
}

const transformDataviewBlocks = (
  root: Root,
  program: DataviewProgram["Service"]
): Effect.Effect<AnyNode, DataviewParseError | DataviewEvaluateError | DataviewRecordSourceError> =>
  mapEffect(root, (cursor) => {
    if (cursor.node._tag !== "CodeNode" || !isDataviewCodeNode(cursor.node)) {
      return Effect.succeed(cursor.node)
    }
    return program.run(cursor.node.value).pipe(Effect.map(resultToMarkdownNode))
  })

const isDataviewCodeNode = (node: CodeNode): boolean => {
  if (Option.isSome(node.lang) && node.lang.value === "dataview") {
    return true
  }
  const language = (node as { readonly language?: unknown }).language
  return language === "dataview"
}

const resultToMarkdownNode = (result: DataviewResult): TableNode | ParagraphNode => {
  switch (result._tag) {
    case "QueryResult":
      if (result.columns.length === 0 || result.rows.length === 0) {
        return noRowsParagraph()
      }
      return {
        _tag: "TableNode",
        type: "table",
        align: Option.none(),
        children: [
          tableRow(result.columns.map((column) => tableCell(column.label))),
          ...result.rows.map((row) => tableRow(result.columns.map((column) => tableCell(cellText(row.cells[column.key])))))
        ]
      }
  }
}

const noRowsParagraph = (): ParagraphNode => ({
  _tag: "ParagraphNode",
  type: "paragraph",
  children: [text("No rows found.")]
})

const tableRow = (children: ReadonlyArray<TableCellNode>): TableRowNode => ({
  _tag: "TableRowNode",
  type: "tableRow",
  children
})

const tableCell = (value: string): TableCellNode => ({
  _tag: "TableCellNode",
  type: "tableCell",
  children: [text(value)]
})

const text = (value: string): TextNode => ({
  _tag: "TextNode",
  type: "text",
  value
})

const cellText = (value: DataviewValue | undefined): string => {
  if (value === undefined || value === null) {
    return ""
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === null ? "" : `${item}`)).join(", ")
  }
  return `${value}`
}
