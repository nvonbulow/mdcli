import { Data, Effect, Iterable, Option } from "effect"
import { dual } from "effect/Function"
import type { AnyNode } from "./schema.js"

export interface Cursor {
  readonly node: AnyNode
  readonly parents: ReadonlyArray<AnyNode>
  readonly index: number | undefined
}

export type VisitControl = Data.TaggedEnum<{
  readonly Continue: {}
  readonly SkipChildren: {}
  readonly Stop: {}
}>

export const VisitControl = Data.taggedEnum<VisitControl>()

type ParentNode = AnyNode & {
  readonly children: ReadonlyArray<AnyNode>
}

type Visitor = (node: AnyNode) => void
type VisitorEffect<E, R> = (node: AnyNode) => Effect.Effect<void, E, R>
type ControlledVisitor = (cursor: Cursor) => VisitControl
type ControlledVisitorEffect<E, R> = (cursor: Cursor) => Effect.Effect<VisitControl, E, R>
type Predicate = (cursor: Cursor) => boolean
type PredicateEffect<E, R> = (cursor: Cursor) => Effect.Effect<boolean, E, R>

const continueTraversal = VisitControl.Continue()
const stopTraversal = VisitControl.Stop()

const hasChildren = (node: AnyNode): node is ParentNode => "children" in node

const pushChildren = (stack: Array<Cursor>, cursor: Cursor): void => {
  if (!hasChildren(cursor.node)) {
    return
  }

  const parents = [...cursor.parents, cursor.node]
  for (let index = cursor.node.children.length - 1; index >= 0; index--) {
    const child = cursor.node.children[index]
    if (child !== undefined) {
      stack.push({ node: child, parents, index })
    }
  }
}

export function* walk(root: AnyNode): Iterable<Cursor> {
  const stack: Array<Cursor> = [{ node: root, parents: [], index: undefined }]

  while (stack.length > 0) {
    const cursor = stack.pop()
    if (cursor === undefined) {
      continue
    }

    yield cursor
    pushChildren(stack, cursor)
  }
}

export const visitControlled = dual<
  (visitor: ControlledVisitor) => (node: AnyNode) => void,
  (node: AnyNode, visitor: ControlledVisitor) => void
>(
  2,
  (node: AnyNode, visitor: ControlledVisitor): void => {
    const stack: Array<Cursor> = [{ node, parents: [], index: undefined }]

    while (stack.length > 0) {
      const cursor = stack.pop()
      if (cursor === undefined) {
        continue
      }

      const control = visitor(cursor)

      switch (control._tag) {
        case "Continue": {
          pushChildren(stack, cursor)
          break
        }
        case "SkipChildren": {
          break
        }
        case "Stop": {
          return
        }
      }
    }
  }
)

export const visitControlledEffect = dual<
  <E, R>(visitor: ControlledVisitorEffect<E, R>) => (node: AnyNode) => Effect.Effect<void, E, R>,
  <E, R>(node: AnyNode, visitor: ControlledVisitorEffect<E, R>) => Effect.Effect<void, E, R>
>(
  2,
  <E, R>(node: AnyNode, visitor: ControlledVisitorEffect<E, R>): Effect.Effect<void, E, R> =>
    Effect.gen(function* () {
      const stack: Array<Cursor> = [{ node, parents: [], index: undefined }]

      while (stack.length > 0) {
        const cursor = stack.pop()
        if (cursor === undefined) {
          continue
        }

        const control = yield* visitor(cursor)

        switch (control._tag) {
          case "Continue": {
            pushChildren(stack, cursor)
            break
          }
          case "SkipChildren": {
            break
          }
          case "Stop": {
            return
          }
        }
      }
    })
)

export const visit = dual<
  (visitor: Visitor) => (node: AnyNode) => void,
  (node: AnyNode, visitor: Visitor) => void
>(
  2,
  (node: AnyNode, visitor: Visitor): void =>
    visitControlled(node, (cursor) => {
      visitor(cursor.node)
      return continueTraversal
    })
)

export const visitEffect = dual<
  <E, R>(visitor: VisitorEffect<E, R>) => (node: AnyNode) => Effect.Effect<void, E, R>,
  <E, R>(node: AnyNode, visitor: VisitorEffect<E, R>) => Effect.Effect<void, E, R>
>(
  2,
  <E, R>(node: AnyNode, visitor: VisitorEffect<E, R>): Effect.Effect<void, E, R> =>
    visitControlledEffect(node, (cursor) => Effect.as(visitor(cursor.node), continueTraversal))
)

export const find = dual<
  (predicate: Predicate) => (node: AnyNode) => Option.Option<Cursor>,
  (node: AnyNode, predicate: Predicate) => Option.Option<Cursor>
>(
  2,
  (node: AnyNode, predicate: Predicate): Option.Option<Cursor> => {
    for (const cursor of walk(node)) {
      if (predicate(cursor)) {
        return Option.some(cursor)
      }
    }

    return Option.none()
  }
)

export const findEffect = dual<
  <E, R>(predicate: PredicateEffect<E, R>) => (node: AnyNode) => Effect.Effect<Option.Option<Cursor>, E, R>,
  <E, R>(node: AnyNode, predicate: PredicateEffect<E, R>) => Effect.Effect<Option.Option<Cursor>, E, R>
>(
  2,
  <E, R>(node: AnyNode, predicate: PredicateEffect<E, R>): Effect.Effect<Option.Option<Cursor>, E, R> =>
    Effect.gen(function* () {
      for (const cursor of walk(node)) {
        if (yield* predicate(cursor)) {
          return Option.some(cursor)
        }
      }

      return Option.none()
    })
)

export const findAll = dual<
  (predicate: Predicate) => (node: AnyNode) => Iterable<Cursor>,
  (node: AnyNode, predicate: Predicate) => Iterable<Cursor>
>(2, (node: AnyNode, predicate: Predicate): Iterable<Cursor> => Iterable.filter(walk(node), predicate))

export const findAllEffect = dual<
  <E, R>(predicate: PredicateEffect<E, R>) => (node: AnyNode) => Effect.Effect<ReadonlyArray<Cursor>, E, R>,
  <E, R>(node: AnyNode, predicate: PredicateEffect<E, R>) => Effect.Effect<ReadonlyArray<Cursor>, E, R>
>(
  2,
  <E, R>(node: AnyNode, predicate: PredicateEffect<E, R>): Effect.Effect<ReadonlyArray<Cursor>, E, R> =>
    Effect.gen(function* () {
      const found: Array<Cursor> = []

      for (const cursor of walk(node)) {
        if (yield* predicate(cursor)) {
          found.push(cursor)
        }
      }

      return found
    })
)
