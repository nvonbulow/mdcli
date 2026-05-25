import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { remarkObsidian } from "@kb/remark-obsidian"
import { Console, Effect } from "effect"
import { FileSystem } from "effect/FileSystem"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkStringify from "remark-stringify"

import * as Ast from "./ast"
const COMPLETED_DATE = "2026-05-26"
const COMPLETED_FIELD_KEY = "completed"
const COMPLETED_FIELD_ORIGINAL = `[completed:: ${COMPLETED_DATE}]`

interface MutableTextNode {
  type: "text"
  value: string
}

interface MutableObsidianInlineField {
  type: "obsidianInlineField"
  key: string
  value: string
  original: string
  valueStart: number
  valueEnd: number
}

type MutablePhrasingNode = MutableTextNode | MutableObsidianInlineField | { type: string }

interface MutableParagraph {
  type: "paragraph"
  children: MutablePhrasingNode[]
}

interface MutableTaskListItem {
  type: "listItem"
  checked: boolean
  children: Array<MutableParagraph | { type: string }>
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkObsidian)
  .use(remarkStringify)

const parseAndRun = (markdown: string) =>
  Effect.try({
    try: () => processor.runSync(processor.parse(markdown)) as Root,
    catch: () => "parse/run failed"
  }).pipe(Effect.map(Ast.make))

const stringify = (ast: Ast.Ast<Root>) =>
  Effect.try({
    try: () => processor.stringify(ast.node),
    catch: () => "stringify failed"
  })

const isTaskListItem = (node: unknown): node is MutableTaskListItem =>
  typeof node === "object" &&
  node !== null &&
  "type" in node &&
  node.type === "listItem" &&
  "checked" in node &&
  typeof node.checked === "boolean" &&
  "children" in node &&
  Array.isArray(node.children)

const isParagraph = (node: unknown): node is MutableParagraph =>
  typeof node === "object" &&
  node !== null &&
  "type" in node &&
  node.type === "paragraph" &&
  "children" in node &&
  Array.isArray(node.children)

const isTextNode = (node: MutablePhrasingNode): node is MutableTextNode =>
  node.type === "text" && "value" in node && typeof node.value === "string"

const isObsidianInlineField = (node: MutablePhrasingNode): node is MutableObsidianInlineField =>
  node.type === "obsidianInlineField" &&
  "key" in node &&
  typeof node.key === "string" &&
  "value" in node &&
  typeof node.value === "string" &&
  "original" in node &&
  typeof node.original === "string" &&
  "valueStart" in node &&
  typeof node.valueStart === "number" &&
  "valueEnd" in node &&
  typeof node.valueEnd === "number"

const isCompletedField = (node: MutablePhrasingNode): node is MutableObsidianInlineField =>
  isObsidianInlineField(node) && node.key === COMPLETED_FIELD_KEY

const completedField = (): MutableObsidianInlineField => ({
  type: "obsidianInlineField",
  key: COMPLETED_FIELD_KEY,
  value: COMPLETED_DATE,
  original: COMPLETED_FIELD_ORIGINAL,
  valueStart: COMPLETED_FIELD_KEY.length + 4,
  valueEnd: COMPLETED_FIELD_KEY.length + 4 + COMPLETED_DATE.length
})

const updateCompletedField = (field: MutableObsidianInlineField): void => {
  field.value = COMPLETED_DATE
  field.original = COMPLETED_FIELD_ORIGINAL
  field.valueStart = COMPLETED_FIELD_KEY.length + 4
  field.valueEnd = COMPLETED_FIELD_KEY.length + 4 + COMPLETED_DATE.length
}

const isWhitespaceOnlyText = (node: MutablePhrasingNode | undefined): boolean =>
  node !== undefined && isTextNode(node) && node.value.trim() === ""

const coalesceTextNodes = (children: MutablePhrasingNode[]): MutablePhrasingNode[] => {
  const coalesced: MutablePhrasingNode[] = []
  for (const child of children) {
    const previous = coalesced[coalesced.length - 1]
    if (previous !== undefined && isTextNode(previous) && isTextNode(child)) {
      previous.value = previous.value + child.value
    } else {
      coalesced.push(child)
    }
  }
  return coalesced
}

const removeCompletedFields = (paragraph: MutableParagraph): void => {
  const children: MutablePhrasingNode[] = []
  for (let index = 0; index < paragraph.children.length; index += 1) {
    const child = paragraph.children[index]
    if (child === undefined) {
      continue
    }
    if (isCompletedField(child)) {
      const previousChild = children[children.length - 1]
      const nextChild = paragraph.children[index + 1]
      if (
        previousChild !== undefined &&
        nextChild !== undefined &&
        isWhitespaceOnlyText(previousChild) &&
        isWhitespaceOnlyText(nextChild)
      ) {
        index += 1
      }
    } else {
      children.push(child)
    }
  }
  paragraph.children = coalesceTextNodes(children)
}

const trailingBlockIdStart = (value: string): number | undefined => {
  let cursor = value.length - 1
  while (cursor >= 0 && value.charCodeAt(cursor) !== 94) {
    cursor -= 1
  }
  if (cursor <= 0 || value.charCodeAt(cursor - 1) !== 32) {
    return undefined
  }
  for (let index = cursor + 1; index < value.length; index += 1) {
    const char = value.charCodeAt(index)
    const isDigit = char >= 48 && char <= 57
    const isUppercase = char >= 65 && char <= 90
    const isUnderscore = char === 95
    const isLowercase = char >= 97 && char <= 122
    const isHyphen = char === 45
    if (!isDigit && !isUppercase && !isUnderscore && !isLowercase && !isHyphen) {
      return undefined
    }
  }
  return cursor - 1
}

const appendCompletedField = (paragraph: MutableParagraph): void => {
  const field = completedField()
  const last = paragraph.children[paragraph.children.length - 1]
  if (last !== undefined && isTextNode(last)) {
    const blockIdStart = trailingBlockIdStart(last.value)
    if (blockIdStart !== undefined) {
      const blockId = last.value.slice(blockIdStart)
      last.value = last.value.slice(0, blockIdStart)
      paragraph.children.push({ type: "text", value: " " }, field, { type: "text", value: blockId })
      return
    }
    if (last.value.endsWith(" ")) {
      paragraph.children.push(field)
      return
    }
  }
  paragraph.children.push({ type: "text", value: " " }, field)
}

const ensureCompletedField = (paragraph: MutableParagraph): void => {
  let found = false
  for (const child of paragraph.children) {
    if (isCompletedField(child)) {
      updateCompletedField(child)
      found = true
    }
  }
  if (!found) {
    appendCompletedField(paragraph)
  }
}

const updateCompletedMetadata = (task: MutableTaskListItem, originalChecked: boolean): void => {
  const firstChild = task.children[0]
  if (!isParagraph(firstChild)) {
    return
  }
  if (originalChecked) {
    removeCompletedFields(firstChild)
  } else {
    ensureCompletedField(firstChild)
  }
}

const Task = {
  is: isTaskListItem,
  invertCompletion: (task: MutableTaskListItem): void => {
    const originalChecked = task.checked
    updateCompletedMetadata(task, originalChecked)
    task.checked = !originalChecked
  }
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem

  const ast = yield* fs.readFileString("./test.md").pipe(Effect.flatMap(parseAndRun))
  const invertedAst = Ast.mutate(ast, (mutable) => {
    Ast.visitMutable(mutable, (node) => {
      if (Task.is(node.node)) {
        Task.invertCompletion(node.node)
      }
    })
  })
  const markdown = yield* stringify(invertedAst)
  yield* Console.log(markdown)
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
