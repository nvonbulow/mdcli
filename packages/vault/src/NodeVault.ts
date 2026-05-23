import { Array as Arr, Effect, FileSystem, Path, Schema, String as Str } from "effect"
import type { PlatformError } from "effect/PlatformError"
import type { ParsedTask } from "./TaskModel"
import { parseTasksFromMarkdown } from "./TaskParser"

export class ReadVaultOptions extends Schema.Class<ReadVaultOptions>("@kb/vault/ReadVaultOptions")({
  root: Schema.optionalKey(Schema.String),
  projectsPath: Schema.optionalKey(Schema.String)
}) {}

export const readProjectTasks = Effect.fnUntraced(function* (options: ReadVaultOptions = new ReadVaultOptions()) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const vaultRoot = yield* resolveVaultRoot(fs, path, options.root ?? "vault", options.projectsPath ?? "30-Projects")
  const projectRoot = path.join(vaultRoot, options.projectsPath ?? "30-Projects")
  const entries = yield* fs.readDirectory(projectRoot, { recursive: true })
  const markdownFiles = entries.filter((entry) => Str.endsWith(".md")(entry))
  const nestedTasks = yield* Effect.forEach(markdownFiles, (entry) => {
    const fullPath = path.join(projectRoot, entry)
    const sourcePath = normalizePath(path.join(options.root ?? "vault", options.projectsPath ?? "30-Projects", entry))
    return fs.readFileString(fullPath).pipe(Effect.map((markdown) => parseTasksFromMarkdown(markdown, sourcePath)))
  })

  return Arr.flatten(nestedTasks)
})

export type ReadProjectTasksEffect = Effect.Effect<
  ReadonlyArray<ParsedTask>,
  PlatformError,
  FileSystem.FileSystem | Path.Path
>
const resolveVaultRoot = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  projectsPath: string
) {
  const projectRoot = path.join(root, projectsPath)
  const projectRootExists = yield* fs.exists(projectRoot)
  if (projectRootExists) {
    return root
  }

  const workspaceRelativeRoot = path.join("..", "..", root)
  const workspaceRelativeProjectRoot = path.join(workspaceRelativeRoot, projectsPath)
  const workspaceRelativeProjectRootExists = yield* fs.exists(workspaceRelativeProjectRoot)
  if (workspaceRelativeProjectRootExists) {
    return workspaceRelativeRoot
  }

  return root
})

const normalizePath = (path: string): string => Str.replaceAll("\\", "/")(path)
