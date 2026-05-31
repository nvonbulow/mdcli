import { Data, Option } from "effect"
import { dual } from "effect/Function"
import type { AnyNode } from "./schema.js"
import type { Cursor } from "./visit.js"

export type TransformControl = Data.TaggedEnum<{
  readonly Continue: { readonly node: AnyNode }
  readonly Prune: { readonly node: AnyNode }
  readonly Remove: {}
}>

export const TransformControl = Data.taggedEnum<TransformControl>()

export type Transformer = (cursor: Cursor) => TransformControl
export type Mapper = (cursor: Cursor) => AnyNode
export type Predicate = (cursor: Cursor) => boolean

type ParentNode = AnyNode & {
  readonly children: ReadonlyArray<AnyNode>
}

type ChildRewriter = (node: AnyNode, parents: ReadonlyArray<AnyNode>, index: number) => AnyNode | undefined

const hasChildren = (node: AnyNode): node is ParentNode => "children" in node

const withChildren = (node: ParentNode, children: ReadonlyArray<AnyNode>): AnyNode => ({ ...node, children }) as AnyNode

const rewriteChildren = (
  node: AnyNode,
  parents: ReadonlyArray<AnyNode>,
  rewriteChild: ChildRewriter
): AnyNode => {
  if (!hasChildren(node) || node.children.length === 0) {
    return node
  }

  const children = node.children
  const childParents = [...parents, node]
  let rewrittenChildren: Array<AnyNode> | undefined

  for (let index = 0; index < children.length; index++) {
    const child = children[index]
    if (child === undefined) {
      continue
    }

    const rewrittenChild = rewriteChild(child, childParents, index)
    if (rewrittenChildren !== undefined) {
      if (rewrittenChild !== undefined) {
        rewrittenChildren.push(rewrittenChild)
      }
      continue
    }

    if (rewrittenChild === undefined) {
      rewrittenChildren = children.slice(0, index)
      continue
    }

    if (rewrittenChild !== child) {
      rewrittenChildren = children.slice(0, index)
      rewrittenChildren.push(rewrittenChild)
    }
  }

  if (rewrittenChildren === undefined) {
    return node
  }

  return withChildren(node, rewrittenChildren)
}

const transformNode = (
  node: AnyNode,
  transformer: Transformer,
  parents: ReadonlyArray<AnyNode>,
  index: number | undefined
): Option.Option<AnyNode> => {
  const control = transformer({ node, parents, index })

  switch (control._tag) {
    case "Continue": {
      return Option.some(
        rewriteChildren(control.node, parents, (child, childParents, childIndex) => {
          const transformed = transformNode(child, transformer, childParents, childIndex)
          return Option.isSome(transformed) ? transformed.value : undefined
        })
      )
    }
    case "Prune": {
      return Option.some(control.node)
    }
    case "Remove": {
      return Option.none()
    }
  }
}

const mapNode = (
  node: AnyNode,
  mapper: Mapper,
  parents: ReadonlyArray<AnyNode>,
  index: number | undefined
): AnyNode => {
  const rewritten = rewriteChildren(node, parents, (child, childParents, childIndex) =>
    mapNode(child, mapper, childParents, childIndex)
  )
  return mapper({ node: rewritten, parents, index })
}

export const transform = dual<
  (transformer: Transformer) => (node: AnyNode) => Option.Option<AnyNode>,
  (node: AnyNode, transformer: Transformer) => Option.Option<AnyNode>
>(2, (node: AnyNode, transformer: Transformer): Option.Option<AnyNode> => transformNode(node, transformer, [], undefined))

export const map = dual<
  (mapper: Mapper) => (node: AnyNode) => AnyNode,
  (node: AnyNode, mapper: Mapper) => AnyNode
>(2, (node: AnyNode, mapper: Mapper): AnyNode => mapNode(node, mapper, [], undefined))

export const filter = dual<
  (predicate: Predicate) => (node: AnyNode) => Option.Option<AnyNode>,
  (node: AnyNode, predicate: Predicate) => Option.Option<AnyNode>
>(
  2,
  (node: AnyNode, predicate: Predicate): Option.Option<AnyNode> =>
    transformNode(
      node,
      (cursor) => (predicate(cursor) ? TransformControl.Continue({ node: cursor.node }) : TransformControl.Remove()),
      [],
      undefined
    )
)

export const remove = dual<
  (predicate: Predicate) => (node: AnyNode) => Option.Option<AnyNode>,
  (node: AnyNode, predicate: Predicate) => Option.Option<AnyNode>
>(
  2,
  (node: AnyNode, predicate: Predicate): Option.Option<AnyNode> =>
    transformNode(
      node,
      (cursor) => (predicate(cursor) ? TransformControl.Remove() : TransformControl.Continue({ node: cursor.node })),
      [],
      undefined
    )
)
