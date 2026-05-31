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

type Visitor<E, R> = (node: AnyNode) => Effect.Effect<void, E, R>
type ControlledVisitor<E, R> = (cursor: Cursor) => Effect.Effect<VisitControl, E, R>
type Predicate = (cursor: Cursor) => boolean

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
  <E, R>(visitor: ControlledVisitor<E, R>) => (node: AnyNode) => Effect.Effect<void, E, R>,
  <E, R>(node: AnyNode, visitor: ControlledVisitor<E, R>) => Effect.Effect<void, E, R>
>(
  2,
  <E, R>(node: AnyNode, visitor: ControlledVisitor<E, R>): Effect.Effect<void, E, R> =>
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
  <E, R>(visitor: Visitor<E, R>) => (node: AnyNode) => Effect.Effect<void, E, R>,
  <E, R>(node: AnyNode, visitor: Visitor<E, R>) => Effect.Effect<void, E, R>
>(
  2,
  <E, R>(node: AnyNode, visitor: Visitor<E, R>): Effect.Effect<void, E, R> =>
    visitControlled(node, (cursor) => Effect.as(visitor(cursor.node), continueTraversal))
)

export const find = dual<
  (predicate: Predicate) => (node: AnyNode) => Effect.Effect<Option.Option<Cursor>>,
  (node: AnyNode, predicate: Predicate) => Effect.Effect<Option.Option<Cursor>>
>(
  2,
  (node: AnyNode, predicate: Predicate): Effect.Effect<Option.Option<Cursor>> =>
    Effect.gen(function* () {
      let found = Option.none<Cursor>()

      yield* visitControlled(node, (cursor) => {
        if (predicate(cursor)) {
          found = Option.some(cursor)
          return Effect.succeed(stopTraversal)
        }

        return Effect.succeed(continueTraversal)
      })

      return found
    })
)

export const findAll = dual<
  (predicate: Predicate) => (node: AnyNode) => Iterable<Cursor>,
  (node: AnyNode, predicate: Predicate) => Iterable<Cursor>
>(2, (node: AnyNode, predicate: Predicate): Iterable<Cursor> => Iterable.filter(walk(node), predicate))
