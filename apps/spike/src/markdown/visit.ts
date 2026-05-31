import { Effect } from "effect"
import { dual } from "effect/Function"
import type { AnyNode } from "./schema.js"

type Visitor<E, R> = (node: AnyNode) => Effect.Effect<void, E, R>

const visitNode = <E, R>(node: AnyNode, visitor: Visitor<E, R>): Effect.Effect<void, E, R> =>
  Effect.gen(function* () {
    yield* visitor(node)

    if ("children" in node) {
      yield* Effect.forEach(node.children, (child) => visitNode(child, visitor), {
        discard: true
      })
    }
  })

export const visit = dual<
  <E, R>(visitor: Visitor<E, R>) => (node: AnyNode) => Effect.Effect<void, E, R>,
  <E, R>(node: AnyNode, visitor: Visitor<E, R>) => Effect.Effect<void, E, R>
>(2, (node, visitor) => visitNode(node, visitor))
