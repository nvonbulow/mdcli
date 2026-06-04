import type { Literal } from "mdast"
import type { Position } from "unist"

import { optionalPosition } from "./position.js"

export interface BlockAnchor extends Literal {
  readonly type: "blockAnchor"
  readonly value: string
  readonly id: string
  readonly original: string
  readonly position?: Position
}

export const blockAnchorPattern = /(?<!\S)\^([A-Za-z0-9-]+)(?=$|\s)/g

export const blockAnchorNode = (id: string, original: string, position: Position | undefined): BlockAnchor => ({
  type: "blockAnchor",
  value: id,
  id,
  original,
  ...optionalPosition(position)
})

export const blockAnchorMarkdown = (node: BlockAnchor): string => `^${node.id}`
