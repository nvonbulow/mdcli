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

import * as Markdown from "./markdown"
const COMPLETED_DATE = "2026-05-26"
const COMPLETED_FIELD_KEY = "completed"
const COMPLETED_FIELD_ORIGINAL = `[completed:: ${COMPLETED_DATE}]`

type Mutable<T> = T extends unknown ? { -readonly [K in keyof T]: T[K] } : never
type MutableWithChildren<T extends { readonly children: ReadonlyArray<Markdown.MarkdownNode> }> =
  Omit<Mutable<T>, "children"> & { children: MutablePhrasingNode[] }

type MutableTextNode = Mutable<Markdown.MarkdownText>
type MutableObsidianInlineField = Mutable<Markdown.MarkdownObsidianInlineField>
type MutablePhrasingNode = Mutable<Markdown.MarkdownNode>
type MutableParagraph = MutableWithChildren<Markdown.MarkdownParagraph>
type MutableTaskListItem = Omit<MutableWithChildren<Markdown.MarkdownListItem>, "checked"> & { checked: boolean }

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkObsidian)
  .use(remarkStringify)

const parseAndRun = (markdown: string) =>
  Effect.try({
    try: () => Markdown.fromMdast(processor.runSync(processor.parse(markdown)) as Root),
    catch: () => "parse/run failed"
  })

const stringify = (root: Markdown.MarkdownRoot) =>
  Effect.try({
    try: () => processor.stringify(root as unknown as Root),
    catch: () => "stringify failed"
  })

const visitMutable = (node: Markdown.MarkdownNode, f: (node: Markdown.MarkdownNode) => void): void => {
  f(node)
  if (Markdown.isParent(node)) {
    node.children.forEach((child: Markdown.MarkdownNode) => visitMutable(child, f))
  }
}

const isTaskListItem = (node: Markdown.MarkdownNode): node is MutableTaskListItem =>
  Markdown.MarkdownNode.$is("ListItem")(node) && typeof node.checked === "boolean"

const isParagraph = (node: Markdown.MarkdownNode | undefined): node is MutableParagraph =>
  node !== undefined && Markdown.MarkdownNode.$is("Paragraph")(node)

const isTextNode = (node: MutablePhrasingNode): node is MutableTextNode =>
  Markdown.MarkdownNode.$is("Text")(node)

const isObsidianInlineField = (node: MutablePhrasingNode): node is MutableObsidianInlineField =>
  Markdown.MarkdownNode.$is("ObsidianInlineField")(node) &&
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

const completedField = (): MutableObsidianInlineField =>
  Markdown.MarkdownNode.ObsidianInlineField({
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
      paragraph.children.push(Markdown.MarkdownNode.Text({ type: "text", value: " " }), field, Markdown.MarkdownNode.Text({ type: "text", value: blockId }))
      return
    }
    if (last.value.endsWith(" ")) {
      paragraph.children.push(field)
      return
    }
  }
  paragraph.children.push(Markdown.MarkdownNode.Text({ type: "text", value: " " }), field)
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

  const taggedRoot = yield* fs.readFileString("./test.md").pipe(Effect.flatMap(parseAndRun))
  visitMutable(taggedRoot, (node) => {
    if (Task.is(node)) {
      Task.invertCompletion(node)
    }
  })
  const markdown = yield* stringify(taggedRoot)
  yield* Console.log(markdown)
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
