import { MarkdownProcessor, type ListItemNode, type MarkdownStringifyError } from "@kb/markdown-ast"
import { Chunk, Effect, Option } from "effect"
import { Markdown, MarkdownModel, notes, type VaultShape } from "@kb/vault-core"
import { Task } from "./TaskModel"

type MarkdownFile = MarkdownModel.MarkdownFile
type SourcePosition = MarkdownModel.SourcePosition

export type VaultTaskRecord = {
  readonly path: string
  readonly file: MarkdownFile
  readonly node: ListItemNode
  readonly position?: SourcePosition | undefined
  readonly task: Task
  readonly done: boolean
  readonly text: string
  readonly fields: Readonly<Record<string, string>>
  readonly unknownFields: Readonly<Record<string, string>>
  readonly tags: Chunk.Chunk<string>
}

export const taskRecordsForFile = (
  path: string,
  file: MarkdownFile
): Effect.Effect<Chunk.Chunk<VaultTaskRecord>, MarkdownStringifyError, MarkdownProcessor> =>
  Effect.gen(function* () {
    let records = Chunk.empty<VaultTaskRecord>()
    for (const node of Markdown.tasks(file)) {
      const task = yield* taskFromNode(path, file, node)
      if (Option.isSome(task)) {
        records = Chunk.append(records, {
          path,
          file,
          node,
          task: task.value,
          done: task.value.done,
          text: task.value.text,
          fields: task.value.fields,
          unknownFields: task.value.unknownFields,
          tags: Chunk.fromIterable(task.value.tags),
          ...optionalPosition(task.value.source?.position)
        })
      }
    }
    return records
  })

export const taskRecordsForVault = (
  vault: VaultShape
): Effect.Effect<Chunk.Chunk<VaultTaskRecord>, MarkdownStringifyError, MarkdownProcessor> =>
  Effect.gen(function* () {
    let records = Chunk.empty<VaultTaskRecord>()
    for (const note of notes(vault)) {
      records = Chunk.appendAll(records, yield* taskRecordsForFile(note.path, note.file))
    }
    return records
  })

export const taskRecordsForVaultNoDeps = (
  vault: VaultShape
): Effect.Effect<Chunk.Chunk<VaultTaskRecord>, MarkdownStringifyError> =>
  taskRecordsForVault(vault).pipe(Effect.provide(MarkdownProcessor.layer))

const taskFromNode = (
  path: string,
  file: MarkdownFile,
  node: ListItemNode
): Effect.Effect<Option.Option<Task>, MarkdownStringifyError, MarkdownProcessor> =>
  Effect.map(Task.from(node), (task) =>
    Option.map(task, (task) => {
      const position = node.position
      return new Task(
        {
          done: task.done,
          text: task.text,
          source: MarkdownModel.sourceRef(path, file, node, position),
          fields: task.fields,
          unknownFields: task.unknownFields,
          tags: task.tags,
          ...optionalValue("scheduled", task.scheduled),
          ...optionalValue("due", task.due),
          ...optionalValue("completed", task.completed),
          ...optionalValue("depends", task.depends),
          ...optionalValue("repeat", task.repeat),
          ...optionalValue("area", task.area),
          ...optionalValue("project", task.project)
        }
      )
    })
  )

const optionalPosition = <P>(position: P | undefined): { readonly position?: P } => {
  if (position === undefined) {
    return {}
  }
  return { position }
}

const optionalValue = <Key extends string, Value>(
  key: Key,
  value: Value | undefined
): { readonly [K in Key]?: Value } => {
  if (value === undefined) {
    return {}
  }
  return { [key]: value } as { readonly [K in Key]?: Value }
}
