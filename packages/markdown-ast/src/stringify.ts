import type { Options as RemarkStringifyOptions } from "remark-stringify"

const obsidianInlineFieldStart = /\\\[(?=[A-Za-z][^\]\n]*:: )/g

type TextHandler = NonNullable<RemarkStringifyOptions["handlers"]>["text"]

const text: TextHandler = (node, parent, state, info) =>
  state.safe(node.value, info).replace(obsidianInlineFieldStart, "[")

export const markdownStringifyOptions: RemarkStringifyOptions = {
  bullet: "-",
  handlers: { text }
}
