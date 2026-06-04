import { Option } from "effect"
import { dual } from "effect/Function"

import type { AnyNode, WikilinkNode } from "./schema.js"
import { map } from "./transform.js"

const wikilinkOriginal = (node: WikilinkNode, target: string): string => {
  const block = Option.getOrUndefined(node.block)
  const header = Option.getOrUndefined(node.header)
  const alias = Option.getOrUndefined(node.alias)
  const embed = Option.isSome(node.embed) && node.embed.value === true ? "!" : ""
  const fragment = block === undefined ? (header === undefined ? "" : `#${header}`) : `#^${block}`
  const display = alias === undefined ? "" : `|${alias}`

  return `${embed}[[${target}${fragment}${display}]]`
}

export const renameWikilinkTarget: {
  (from: string, to: string): (node: AnyNode) => AnyNode
  (node: AnyNode, from: string, to: string): AnyNode
} = dual<
  (from: string, to: string) => (node: AnyNode) => AnyNode,
  (node: AnyNode, from: string, to: string) => AnyNode
>(3, (node: AnyNode, from: string, to: string): AnyNode => {
  if (from === to) {
    return node
  }

  return map(node, ({ node }) => {
    if (node._tag !== "WikilinkNode" || node.target !== from) {
      return node
    }

    return {
      ...node,
      target: to,
      value: Option.isNone(node.alias) && from.length > 0 && node.value === from ? to : node.value,
      // todo: original may not strictly be necessary; it's more disposable metadata, so perhaps it should be optional
      original: wikilinkOriginal(node, to)
    }
  })
})
