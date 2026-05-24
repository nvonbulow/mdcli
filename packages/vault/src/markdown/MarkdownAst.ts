import * as Effect from "effect/Effect"
import type { MarkdownFile, SourcePosition } from "./MarkdownModel"

type AstNode = {
  readonly type: string
  readonly position?: SourcePosition
  readonly children?: ReadonlyArray<AstNode>
}

export const MarkdownAst = {
  collect: <NodeType extends AstNode = AstNode>(
    fileOrNode: MarkdownFile | AstNode,
    type: string
  ): Effect.Effect<ReadonlyArray<NodeType>> => Effect.succeed(collectNodes<NodeType>(nodeOf(fileOrNode), type)),
  visit: (fileOrNode: MarkdownFile | AstNode, visitor: (node: AstNode) => void): Effect.Effect<void> =>
    Effect.sync(() => visitNode(nodeOf(fileOrNode), visitor)),
  position: (node: AstNode): SourcePosition | undefined => node.position,
  sourceLine: (file: MarkdownFile, nodeOrPosition: AstNode | SourcePosition | undefined): string | undefined => {
    const position = positionOf(nodeOrPosition)
    const line = position?.start.line
    if (line === undefined) {
      return undefined
    }
    return sourceLine(file.contents, line)
  }
} as const

const collectNodes = <NodeType extends AstNode>(node: AstNode, type: string): ReadonlyArray<NodeType> => {
  const found: Array<NodeType> = []
  visitNode(node, (current) => {
    if (current.type === type) {
      found.push(current as NodeType)
    }
  })
  return found
}

const visitNode = (node: AstNode, visitor: (node: AstNode) => void): void => {
  visitor(node)
  const children = node.children
  if (children === undefined) {
    return
  }
  for (const child of children) {
    visitNode(child, visitor)
  }
}

const nodeOf = (fileOrNode: MarkdownFile | AstNode): AstNode =>
  "mdast" in fileOrNode ? (fileOrNode.mdast as AstNode) : fileOrNode

const positionOf = (nodeOrPosition: AstNode | SourcePosition | undefined): SourcePosition | undefined => {
  if (nodeOrPosition === undefined) {
    return undefined
  }
  return "start" in nodeOrPosition ? nodeOrPosition : nodeOrPosition.position
}

const sourceLine = (contents: string, lineNumber: number): string | undefined => {
  let currentLine = 1
  let lineStart = 0
  let index = 0
  while (index < contents.length) {
    if (contents.charCodeAt(index) === 10) {
      if (currentLine === lineNumber) {
        return contents.slice(lineStart, index)
      }
      currentLine += 1
      lineStart = index + 1
    }
    index += 1
  }
  return currentLine === lineNumber ? contents.slice(lineStart) : undefined
}
