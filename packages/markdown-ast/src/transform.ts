import { Data, Effect, Option } from "effect"
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
export type TransformerEffect<E, R> = (cursor: Cursor) => Effect.Effect<TransformControl, E, R>
export type Mapper = (cursor: Cursor) => AnyNode
export type MapperEffect<E, R> = (cursor: Cursor) => Effect.Effect<AnyNode, E, R>
export type Predicate = (cursor: Cursor) => boolean
export type PredicateEffect<E, R> = (cursor: Cursor) => Effect.Effect<boolean, E, R>

type ParentNode = AnyNode & {
  readonly children: ReadonlyArray<AnyNode>
}

type ChildRewriter = (node: AnyNode, parents: ReadonlyArray<AnyNode>, index: number) => AnyNode | undefined
type ChildRewriterEffect<E, R> = (
  node: AnyNode,
  parents: ReadonlyArray<AnyNode>,
  index: number
) => Effect.Effect<AnyNode | undefined, E, R>

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

const rewriteChildrenEffect = <E, R>(
  node: AnyNode,
  parents: ReadonlyArray<AnyNode>,
  rewriteChild: ChildRewriterEffect<E, R>
): Effect.Effect<AnyNode, E, R> =>
  Effect.gen(function* () {
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

      const rewrittenChild = yield* rewriteChild(child, childParents, index)
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
  })

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

const transformNodeEffect = <E, R>(
  node: AnyNode,
  transformer: TransformerEffect<E, R>,
  parents: ReadonlyArray<AnyNode>,
  index: number | undefined
): Effect.Effect<Option.Option<AnyNode>, E, R> =>
  Effect.gen(function* () {
    const control = yield* transformer({ node, parents, index })

    switch (control._tag) {
      case "Continue": {
        const rewritten = yield* rewriteChildrenEffect(control.node, parents, (child, childParents, childIndex) =>
          transformNodeEffect(child, transformer, childParents, childIndex).pipe(
            Effect.map((transformed) => (Option.isSome(transformed) ? transformed.value : undefined))
          )
        )
        return Option.some(rewritten)
      }
      case "Prune": {
        return Option.some(control.node)
      }
      case "Remove": {
        return Option.none()
      }
    }
  })

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

const mapNodeEffect = <E, R>(
  node: AnyNode,
  mapper: MapperEffect<E, R>,
  parents: ReadonlyArray<AnyNode>,
  index: number | undefined
): Effect.Effect<AnyNode, E, R> =>
  Effect.gen(function* () {
    const rewritten = yield* rewriteChildrenEffect(node, parents, (child, childParents, childIndex) =>
      mapNodeEffect(child, mapper, childParents, childIndex)
    )
    return yield* mapper({ node: rewritten, parents, index })
  })

export const transform = dual<
  (transformer: Transformer) => (node: AnyNode) => Option.Option<AnyNode>,
  (node: AnyNode, transformer: Transformer) => Option.Option<AnyNode>
>(2, (node: AnyNode, transformer: Transformer): Option.Option<AnyNode> => transformNode(node, transformer, [], undefined))

export const transformEffect = dual<
  <E, R>(transformer: TransformerEffect<E, R>) => (node: AnyNode) => Effect.Effect<Option.Option<AnyNode>, E, R>,
  <E, R>(node: AnyNode, transformer: TransformerEffect<E, R>) => Effect.Effect<Option.Option<AnyNode>, E, R>
>(
  2,
  <E, R>(node: AnyNode, transformer: TransformerEffect<E, R>): Effect.Effect<Option.Option<AnyNode>, E, R> =>
    transformNodeEffect(node, transformer, [], undefined)
)

export const map = dual<
  (mapper: Mapper) => (node: AnyNode) => AnyNode,
  (node: AnyNode, mapper: Mapper) => AnyNode
>(2, (node: AnyNode, mapper: Mapper): AnyNode => mapNode(node, mapper, [], undefined))

export const mapEffect = dual<
  <E, R>(mapper: MapperEffect<E, R>) => (node: AnyNode) => Effect.Effect<AnyNode, E, R>,
  <E, R>(node: AnyNode, mapper: MapperEffect<E, R>) => Effect.Effect<AnyNode, E, R>
>(2, <E, R>(node: AnyNode, mapper: MapperEffect<E, R>): Effect.Effect<AnyNode, E, R> => mapNodeEffect(node, mapper, [], undefined))

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

export const filterEffect = dual<
  <E, R>(predicate: PredicateEffect<E, R>) => (node: AnyNode) => Effect.Effect<Option.Option<AnyNode>, E, R>,
  <E, R>(node: AnyNode, predicate: PredicateEffect<E, R>) => Effect.Effect<Option.Option<AnyNode>, E, R>
>(
  2,
  <E, R>(node: AnyNode, predicate: PredicateEffect<E, R>): Effect.Effect<Option.Option<AnyNode>, E, R> =>
    transformNodeEffect(
      node,
      (cursor) =>
        predicate(cursor).pipe(
          Effect.map((keep) => (keep ? TransformControl.Continue({ node: cursor.node }) : TransformControl.Remove()))
        ),
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

export const removeEffect = dual<
  <E, R>(predicate: PredicateEffect<E, R>) => (node: AnyNode) => Effect.Effect<Option.Option<AnyNode>, E, R>,
  <E, R>(node: AnyNode, predicate: PredicateEffect<E, R>) => Effect.Effect<Option.Option<AnyNode>, E, R>
>(
  2,
  <E, R>(node: AnyNode, predicate: PredicateEffect<E, R>): Effect.Effect<Option.Option<AnyNode>, E, R> =>
    transformNodeEffect(
      node,
      (cursor) =>
        predicate(cursor).pipe(
          Effect.map((drop) => (drop ? TransformControl.Remove() : TransformControl.Continue({ node: cursor.node })))
        ),
      [],
      undefined
    )
)
