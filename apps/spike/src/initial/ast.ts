import type { Node as UnistNode, Parent as UnistParent, Point, Position } from "unist"
import { Effect } from "effect"
import { dual } from "effect/Function"

export interface Ast<A extends UnistNode = UnistNode> {
  readonly mutable: false
  readonly node: A
}

export interface MutableAst<A extends UnistNode = UnistNode> {
  readonly mutable: true
  readonly node: A
}

class AstWrapper<A extends UnistNode> implements Ast<A> {
  readonly mutable = false

  constructor(readonly node: A) {}
}

class MutableAstWrapper<A extends UnistNode> implements MutableAst<A> {
  readonly mutable = true

  constructor(readonly node: A) {}
}

export const make = <A extends UnistNode>(node: A): Ast<A> => new AstWrapper(node)

const makeMutable = <A extends UnistNode>(node: A): MutableAst<A> => new MutableAstWrapper(node)

interface ParentNode extends UnistParent {
  children: UnistNode[]
}

const isUnistParent = (node: UnistNode): node is ParentNode => "children" in node && Array.isArray(node.children)

const hasPosition = (node: UnistNode): node is UnistNode & { readonly position: Position } =>
  "position" in node && node.position !== undefined

const unwrap = <A extends UnistNode>(node: Ast<A> | MutableAst<A> | A): A =>
  typeof node === "object" && node !== null && "node" in node ? node.node : node

type AstPredicate<A extends UnistNode = UnistNode> = (
  node: Ast<A>,
  parents: ReadonlyArray<Ast>
) => boolean

type AstTest<A extends UnistNode = UnistNode> = string | AstPredicate<A>

type Is = {
  <A extends UnistNode>(test: AstTest<A>): (node: Ast<A>) => boolean
  <A extends UnistNode>(node: Ast<A>, test: AstTest<A>): boolean
}

export const is: Is = dual(
  2,
  <A extends UnistNode>(node: Ast<A>, test: AstTest<A>): boolean =>
    typeof test === "string" ? node.node.type === test : test(node, [])
)

type IsNodeType = {
  (type: string): (node: Ast) => boolean
  (node: Ast, type: string): boolean
}

export const isNodeType: IsNodeType = dual(
  2,
  (node: Ast, type: string): boolean => node.node.type === type
)

type VisitCallback = (
  node: Ast,
  parents: ReadonlyArray<Ast>
) => void

type Visit = {
  (f: VisitCallback): (node: Ast) => void
  (node: Ast, f: VisitCallback): void
}

const visitAst = (
  node: Ast,
  parents: ReadonlyArray<Ast>,
  f: VisitCallback
): void => {
  f(node, parents)

  if (isUnistParent(node.node)) {
    const nextParents = [...parents, node]
    node.node.children.forEach((child) => visitAst(make(child), nextParents, f))
  }
}

export const visit: Visit = dual(
  2,
  (node: Ast, f: VisitCallback): void => visitAst(node, [], f)
)

export const visitNode: Visit = visit

type VisitEffectCallback<E, R> = (
  node: Ast,
  parents: ReadonlyArray<Ast>
) => Effect.Effect<void, E, R>

type VisitEffect = {
  <E, R>(f: VisitEffectCallback<E, R>): (node: Ast) => Effect.Effect<void, E, R>
  <E, R>(node: Ast, f: VisitEffectCallback<E, R>): Effect.Effect<void, E, R>
}

const visitAstEffect = <E, R>(
  node: Ast,
  parents: ReadonlyArray<Ast>,
  f: VisitEffectCallback<E, R>
): Effect.Effect<void, E, R> =>
  Effect.gen(function* () {
    yield* f(node, parents)

    if (isUnistParent(node.node)) {
      const nextParents = [...parents, node]
      yield* Effect.forEach(node.node.children, (child) => visitAstEffect(make(child), nextParents, f), {
        discard: true
      })
    }
  })

export const visitEffect: VisitEffect = dual(
  2,
  <E, R>(node: Ast, f: VisitEffectCallback<E, R>): Effect.Effect<void, E, R> => visitAstEffect(node, [], f)
)

type VisitMutableCallback = (
  node: MutableAst,
  parents: ReadonlyArray<MutableAst>,
  index: number | undefined
) => void

type VisitMutable = {
  (f: VisitMutableCallback): (node: MutableAst) => void
  (node: MutableAst, f: VisitMutableCallback): void
}

const visitMutableAst = (
  node: MutableAst,
  parents: ReadonlyArray<MutableAst>,
  index: number | undefined,
  f: VisitMutableCallback
): void => {
  f(node, parents, index)

  if (isUnistParent(node.node)) {
    const nextParents = [...parents, node]
    node.node.children.forEach((child, childIndex) =>
      visitMutableAst(makeMutable(child), nextParents, childIndex, f)
    )
  }
}

export const visitMutable: VisitMutable = dual(
  2,
  (node: MutableAst, f: VisitMutableCallback): void =>
    visitMutableAst(node, [], undefined, f)
)

type VisitMutableEffectCallback<E, R> = (
  node: MutableAst,
  parents: ReadonlyArray<MutableAst>,
  index: number | undefined
) => Effect.Effect<void, E, R>

type VisitMutableEffect = {
  <E, R>(f: VisitMutableEffectCallback<E, R>): (node: MutableAst) => Effect.Effect<void, E, R>
  <E, R>(node: MutableAst, f: VisitMutableEffectCallback<E, R>): Effect.Effect<void, E, R>
}

const visitMutableAstEffect = <E, R>(
  node: MutableAst,
  parents: ReadonlyArray<MutableAst>,
  index: number | undefined,
  f: VisitMutableEffectCallback<E, R>
): Effect.Effect<void, E, R> =>
  Effect.gen(function* () {
    yield* f(node, parents, index)

    if (isUnistParent(node.node)) {
      const nextParents = [...parents, node]
      yield* Effect.forEach(
        node.node.children,
        (child, childIndex) => visitMutableAstEffect(makeMutable(child), nextParents, childIndex, f),
        { discard: true }
      )
    }
  })

export const visitMutableEffect: VisitMutableEffect = dual(
  2,
  <E, R>(node: MutableAst, f: VisitMutableEffectCallback<E, R>): Effect.Effect<void, E, R> =>
    visitMutableAstEffect(node, [], undefined, f)
)

const cloneWithoutChildren = (node: UnistNode): UnistNode => {
  const cloned: UnistNode & Record<string, unknown> = {
    type: structuredClone(node.type)
  }

  for (const [key, value] of Object.entries(node)) {
    if (key !== "children") {
      cloned[key] = structuredClone(value)
    }
  }

  if (isUnistParent(node)) {
    cloned.children = []
  }

  return cloned
}

type MapCallback<B extends UnistNode> = (
  node: Ast,
  parents: ReadonlyArray<Ast>,
  index: number | undefined
) => B

const mapNode = <B extends UnistNode>(
  node: UnistNode,
  parents: ReadonlyArray<Ast>,
  index: number | undefined,
  f: MapCallback<B>
): UnistNode => {
  const copy = cloneWithoutChildren(node)
  const wrappedCopy = make(copy)

  if (isUnistParent(node) && isUnistParent(copy)) {
    const nextParents = [...parents, wrappedCopy]
    copy.children = node.children.map((child, childIndex) => mapNode(child, nextParents, childIndex, f))
  }

  return f(wrappedCopy, parents, index)
}

type MapEffectCallback<B extends UnistNode, E, R> = (
  node: Ast,
  parents: ReadonlyArray<Ast>,
  index: number | undefined
) => Effect.Effect<B, E, R>

const mapNodeEffect = <B extends UnistNode, E, R>(
  node: UnistNode,
  parents: ReadonlyArray<Ast>,
  index: number | undefined,
  f: MapEffectCallback<B, E, R>
): Effect.Effect<UnistNode, E, R> =>
  Effect.gen(function* () {
    const copy = cloneWithoutChildren(node)
    const wrappedCopy = make(copy)

    if (isUnistParent(node) && isUnistParent(copy)) {
      const nextParents = [...parents, wrappedCopy]
      copy.children = yield* Effect.forEach(node.children, (child, childIndex) =>
        mapNodeEffect(child, nextParents, childIndex, f)
      )
    }

    return yield* f(wrappedCopy, parents, index)
  })

type MapEffect = {
  <B extends UnistNode, E, R>(f: MapEffectCallback<B, E, R>): <A extends UnistNode>(
    node: Ast<A>
  ) => Effect.Effect<Ast<B>, E, R>
  <A extends UnistNode, B extends UnistNode = A, E = never, R = never>(
    node: Ast<A>,
    f: MapEffectCallback<B, E, R>
  ): Effect.Effect<Ast<B>, E, R>
}

export const mapEffect: MapEffect = dual(
  2,
  <A extends UnistNode, B extends UnistNode = A, E = never, R = never>(
    node: Ast<A>,
    f: MapEffectCallback<B, E, R>
  ): Effect.Effect<Ast<B>, E, R> =>
    Effect.gen(function* () {
      const mapped = yield* mapNodeEffect(node.node, [], undefined, f)
      return make(mapped as B)
    })
)

type Map = {
  <B extends UnistNode>(f: MapCallback<B>): <A extends UnistNode>(node: Ast<A>) => Ast<B>
  <A extends UnistNode, B extends UnistNode = A>(node: Ast<A>, f: MapCallback<B>): Ast<B>
}

export const map: Map = dual(
  2,
  <A extends UnistNode, B extends UnistNode = A>(node: Ast<A>, f: MapCallback<B>): Ast<B> =>
    make(mapNode(node.node, [], undefined, f) as B)
)

type FilterPredicate = (
  node: Ast,
  parents: ReadonlyArray<Ast>,
  index: number | undefined
) => boolean

const filterNode = (
  node: UnistNode,
  parents: ReadonlyArray<Ast>,
  index: number | undefined,
  predicate: FilterPredicate,
  keepWhenTrue: boolean
): UnistNode | undefined => {
  const copy = cloneWithoutChildren(node)
  const wrappedCopy = make(copy)
  const keep = predicate(wrappedCopy, parents, index) === keepWhenTrue

  if (!keep) {
    return undefined
  }

  if (isUnistParent(node) && isUnistParent(copy)) {
    const nextParents = [...parents, wrappedCopy]
    copy.children = node.children.flatMap((child, childIndex) => {
      const filtered = filterNode(child, nextParents, childIndex, predicate, keepWhenTrue)
      return filtered === undefined ? [] : [filtered]
    })
  }

  return copy
}

type Filter = {
  (predicate: FilterPredicate): <A extends UnistNode>(node: Ast<A>) => Ast<A> | undefined
  <A extends UnistNode>(node: Ast<A>, predicate: FilterPredicate): Ast<A> | undefined
}

export const filter: Filter = dual(
  2,
  <A extends UnistNode>(node: Ast<A>, predicate: FilterPredicate): Ast<A> | undefined => {
    const filtered = filterNode(node.node, [], undefined, predicate, true)
    return filtered === undefined ? undefined : make(filtered as A)
  }
)

type Remove = Filter

export const remove: Remove = dual(
  2,
  <A extends UnistNode>(node: Ast<A>, predicate: FilterPredicate): Ast<A> | undefined => {
    const filtered = filterNode(node.node, [], undefined, predicate, false)
    return filtered === undefined ? undefined : make(filtered as A)
  }
)

type EffectFilterPredicate<E, R> = (
  node: Ast,
  parents: ReadonlyArray<Ast>,
  index: number | undefined
) => Effect.Effect<boolean, E, R>

const filterNodeEffect = <E, R>(
  node: UnistNode,
  parents: ReadonlyArray<Ast>,
  index: number | undefined,
  predicate: EffectFilterPredicate<E, R>,
  keepWhenTrue: boolean
): Effect.Effect<UnistNode | undefined, E, R> =>
  Effect.gen(function* () {
    const copy = cloneWithoutChildren(node)
    const wrappedCopy = make(copy)
    const keep = (yield* predicate(wrappedCopy, parents, index)) === keepWhenTrue

    if (!keep) {
      return undefined
    }

    if (isUnistParent(node) && isUnistParent(copy)) {
      const nextParents = [...parents, wrappedCopy]
      const children = yield* Effect.forEach(node.children, (child, childIndex) =>
        filterNodeEffect(child, nextParents, childIndex, predicate, keepWhenTrue)
      )
      copy.children = children.filter((child): child is UnistNode => child !== undefined)
    }

    return copy
  })

type FilterEffect = {
  <E, R>(predicate: EffectFilterPredicate<E, R>): <A extends UnistNode>(
    node: Ast<A>
  ) => Effect.Effect<Ast<A> | undefined, E, R>
  <A extends UnistNode, E, R>(
    node: Ast<A>,
    predicate: EffectFilterPredicate<E, R>
  ): Effect.Effect<Ast<A> | undefined, E, R>
}

export const filterEffect: FilterEffect = dual(
  2,
  <A extends UnistNode, E, R>(
    node: Ast<A>,
    predicate: EffectFilterPredicate<E, R>
  ): Effect.Effect<Ast<A> | undefined, E, R> =>
    Effect.gen(function* () {
      const filtered = yield* filterNodeEffect(node.node, [], undefined, predicate, true)
      return filtered === undefined ? undefined : make(filtered as A)
    })
)

type RemoveEffect = FilterEffect

export const removeEffect: RemoveEffect = dual(
  2,
  <A extends UnistNode, E, R>(
    node: Ast<A>,
    predicate: EffectFilterPredicate<E, R>
  ): Effect.Effect<Ast<A> | undefined, E, R> =>
    Effect.gen(function* () {
      const filtered = yield* filterNodeEffect(node.node, [], undefined, predicate, false)
      return filtered === undefined ? undefined : make(filtered as A)
    })
)


type ModifyChildrenCallback = (
  parent: MutableAst<ParentNode>,
  children: ReadonlyArray<UnistNode>
) => ReadonlyArray<UnistNode>

type ModifyChildren = {
  (f: ModifyChildrenCallback): (node: MutableAst) => void
  (node: MutableAst, f: ModifyChildrenCallback): void
}

export const modifyChildren: ModifyChildren = dual(
  2,
  (node: MutableAst, f: ModifyChildrenCallback): void =>
    visitMutable(node, (current) => {
      if (isUnistParent(current.node)) {
        current.node.children = [...f(current as MutableAst<ParentNode>, current.node.children)]
      }
    })
)

type ModifyChildrenEffectCallback<E, R> = (
  parent: MutableAst<ParentNode>,
  children: ReadonlyArray<UnistNode>
) => Effect.Effect<ReadonlyArray<UnistNode>, E, R>

type ModifyChildrenEffect = {
  <E, R>(f: ModifyChildrenEffectCallback<E, R>): (node: MutableAst) => Effect.Effect<void, E, R>
  <E, R>(node: MutableAst, f: ModifyChildrenEffectCallback<E, R>): Effect.Effect<void, E, R>
}

export const modifyChildrenEffect: ModifyChildrenEffect = dual(
  2,
  <E, R>(node: MutableAst, f: ModifyChildrenEffectCallback<E, R>): Effect.Effect<void, E, R> =>
    visitMutableEffect(node, (current) =>
      Effect.gen(function* () {
        if (isUnistParent(current.node)) {
          const children = yield* f(current as MutableAst<ParentNode>, current.node.children)
          current.node.children = [...children]
        }
      })
    )
)


type QueryTest = string | FilterPredicate

type Find = {
  (test: QueryTest): (node: Ast) => Ast | undefined
  (node: Ast, test: QueryTest): Ast | undefined
}

const matchesQuery = (node: Ast, parents: ReadonlyArray<Ast>, index: number | undefined, test: QueryTest): boolean =>
  typeof test === "string" ? node.node.type === test : test(node, parents, index)

type EffectQueryTest<E, R> = string | EffectFilterPredicate<E, R>

const matchesQueryEffect = <E, R>(
  node: Ast,
  parents: ReadonlyArray<Ast>,
  index: number | undefined,
  test: EffectQueryTest<E, R>
): Effect.Effect<boolean, E, R> =>
  typeof test === "string" ? Effect.succeed(node.node.type === test) : test(node, parents, index)

type FindEffect = {
  (test: string): (node: Ast) => Effect.Effect<Ast | undefined>
  <E, R>(test: EffectFilterPredicate<E, R>): (node: Ast) => Effect.Effect<Ast | undefined, E, R>
  (node: Ast, test: string): Effect.Effect<Ast | undefined>
  <E, R>(node: Ast, test: EffectFilterPredicate<E, R>): Effect.Effect<Ast | undefined, E, R>
}

const findNodeEffect = <E, R>(
  node: Ast,
  parents: ReadonlyArray<Ast>,
  index: number | undefined,
  test: EffectQueryTest<E, R>
): Effect.Effect<Ast | undefined, E, R> =>
  Effect.gen(function* () {
    if (yield* matchesQueryEffect(node, parents, index, test)) {
      return node
    }

    if (isUnistParent(node.node)) {
      const nextParents = [...parents, node]

      for (let childIndex = 0; childIndex < node.node.children.length; childIndex++) {
        const found = yield* findNodeEffect(make(node.node.children[childIndex]!), nextParents, childIndex, test)

        if (found !== undefined) {
          return found
        }
      }
    }

    return undefined
  })

export const findEffect: FindEffect = dual(
  2,
  <E, R>(node: Ast, test: EffectQueryTest<E, R>): Effect.Effect<Ast | undefined, E, R> =>
    findNodeEffect(node, [], undefined, test)
)

type FindAllEffect = {
  (test: string): (node: Ast) => Effect.Effect<ReadonlyArray<Ast>>
  <E, R>(test: EffectFilterPredicate<E, R>): (node: Ast) => Effect.Effect<ReadonlyArray<Ast>, E, R>
  (node: Ast, test: string): Effect.Effect<ReadonlyArray<Ast>>
  <E, R>(node: Ast, test: EffectFilterPredicate<E, R>): Effect.Effect<ReadonlyArray<Ast>, E, R>
}

const findAllNodeEffect = <E, R>(
  node: Ast,
  parents: ReadonlyArray<Ast>,
  index: number | undefined,
  test: EffectQueryTest<E, R>
): Effect.Effect<ReadonlyArray<Ast>, E, R> =>
  Effect.gen(function* () {
    const found: Ast[] = []

    if (yield* matchesQueryEffect(node, parents, index, test)) {
      found.push(node)
    }

    if (isUnistParent(node.node)) {
      const nextParents = [...parents, node]

      for (let childIndex = 0; childIndex < node.node.children.length; childIndex++) {
        found.push(
          ...(yield* findAllNodeEffect(make(node.node.children[childIndex]!), nextParents, childIndex, test))
        )
      }
    }

    return found
  })

export const findAllEffect: FindAllEffect = dual(
  2,
  <E, R>(node: Ast, test: EffectQueryTest<E, R>): Effect.Effect<ReadonlyArray<Ast>, E, R> =>
    findAllNodeEffect(node, [], undefined, test)
)
export const find: Find = dual(
  2,
  (node: Ast, test: QueryTest): Ast | undefined => {
    let found: Ast | undefined

    const go = (current: Ast, parents: ReadonlyArray<Ast>, index: number | undefined): void => {
      if (found !== undefined) {
        return
      }

      if (matchesQuery(current, parents, index, test)) {
        found = current
        return
      }

      if (isUnistParent(current.node)) {
        const nextParents = [...parents, current]
        current.node.children.forEach((child, childIndex) => go(make(child), nextParents, childIndex))
      }
    }

    go(node, [], undefined)
    return found
  }
)

type FindAll = {
  (test: QueryTest): (node: Ast) => ReadonlyArray<Ast>
  (node: Ast, test: QueryTest): ReadonlyArray<Ast>
}

export const findAll: FindAll = dual(
  2,
  (node: Ast, test: QueryTest): ReadonlyArray<Ast> => {
    const found: Ast[] = []

    const go = (current: Ast, parents: ReadonlyArray<Ast>, index: number | undefined): void => {
      if (matchesQuery(current, parents, index, test)) {
        found.push(current)
      }

      if (isUnistParent(current.node)) {
        const nextParents = [...parents, current]
        current.node.children.forEach((child, childIndex) => go(make(child), nextParents, childIndex))
      }
    }

    go(node, [], undefined)
    return found
  }
)

export const position = (node: Ast | MutableAst | UnistNode): Position | undefined => {
  const raw = unwrap(node)
  return hasPosition(raw) ? raw.position : undefined
}

const pointString = (point: Point | undefined): string =>
  point === undefined ? "?:?" : `${point.line ?? "?"}:${point.column ?? "?"}`

export const stringifyPosition = (node: Ast | MutableAst | UnistNode): string => {
  const nodePosition = position(node)

  if (nodePosition === undefined) {
    return "?:?"
  }

  const start = pointString(nodePosition.start)
  const end = pointString(nodePosition.end)
  return start === end || end === "?:?" ? start : `${start}-${end}`
}

type Location = {
  (file: string): (node: Ast | MutableAst | UnistNode) => string
  (node: Ast | MutableAst | UnistNode): string
  (node: Ast | MutableAst | UnistNode, file: string): string
}

export const location: Location = dual(
  (args) => args.length !== 1 || typeof args[0] !== "string",
  (node: Ast | MutableAst | UnistNode, file?: string): string => {
    const nodePosition = stringifyPosition(node)
    return file === undefined ? nodePosition : `${file}:${nodePosition}`
  }
)

type Source = {
  (markdown: string): (node: Ast | MutableAst | UnistNode) => string | undefined
  (markdown: string, node: Ast | MutableAst | UnistNode): string | undefined
}

const sourceSlice = (markdown: string, node: Ast | MutableAst | UnistNode): string | undefined => {
  const nodePosition = position(node)
  const start = nodePosition?.start.offset
  const end = nodePosition?.end.offset

  return start === undefined || end === undefined || start > end ? undefined : markdown.slice(start, end)
}

export const source: Source = dual(
  (args) => args.length === 2,
  (
    markdownOrNode: string | Ast | MutableAst | UnistNode,
    nodeOrMarkdown: string | Ast | MutableAst | UnistNode
  ): string | undefined =>
    typeof markdownOrNode === "string"
      ? sourceSlice(markdownOrNode, nodeOrMarkdown as Ast | MutableAst | UnistNode)
      : sourceSlice(nodeOrMarkdown as string, markdownOrNode)
)

export const inspect = (node: Ast): string => {
  const lines: string[] = []

  const go = (current: Ast, depth: number): void => {
    const prefix = "  ".repeat(depth)
    const currentPosition = stringifyPosition(current)
    lines.push(currentPosition === "?:?" ? `${prefix}${current.node.type}` : `${prefix}${current.node.type} ${currentPosition}`)

    if (isUnistParent(current.node)) {
      current.node.children.forEach((child) => go(make(child), depth + 1))
    }
  }

  go(node, 0)
  return lines.join("\n")
}

const beginMutation = <A extends UnistNode>(node: Ast<A>): MutableAst<A> => makeMutable(structuredClone(node.node))

const endMutation = <A extends UnistNode>(mutable: MutableAst<A>): Ast<A> => make(mutable.node)

type Mutate = {
  <A extends UnistNode>(f: (mutable: MutableAst<A>) => void): (node: Ast<A>) => Ast<A>
  <A extends UnistNode>(node: Ast<A>, f: (mutable: MutableAst<A>) => void): Ast<A>
}

export const mutate: Mutate = dual(
  2,
  <A extends UnistNode>(node: Ast<A>, f: (mutable: MutableAst<A>) => void): Ast<A> => {
    const mutable = beginMutation(node)
    f(mutable)
    return endMutation(mutable)
  }
)

type MutateEffect = {
  <A extends UnistNode, B, E, R>(
    f: (mutable: MutableAst<A>) => Effect.Effect<B, E, R>
  ): (node: Ast<A>) => Effect.Effect<Ast<A>, E, R>
  <A extends UnistNode, B, E, R>(
    node: Ast<A>,
    f: (mutable: MutableAst<A>) => Effect.Effect<B, E, R>
  ): Effect.Effect<Ast<A>, E, R>
}

export const mutateEffect: MutateEffect = dual(
  2,
  <A extends UnistNode, B, E, R>(
    node: Ast<A>,
    f: (mutable: MutableAst<A>) => Effect.Effect<B, E, R>
  ): Effect.Effect<Ast<A>, E, R> =>
    Effect.gen(function* () {
      const mutable = beginMutation(node)
      yield* f(mutable)
      return endMutation(mutable)
    })
)
