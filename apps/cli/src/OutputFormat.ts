import { DataviewRenderer, type OutputFormat } from "@kb/dataview"
import { Chunk } from "effect"
import { allMarkdown, fromPatterns, type VaultScope } from "@kb/vault"
import type * as Layer from "effect/Layer"
import { Flag } from "effect/unstable/cli"

export const vaultFlag = Flag.directory("vault", { mustExist: true }).pipe(
  Flag.withDescription("Markdown vault root"),
  Flag.withDefault("./vault")
)

export const formatFlag = Flag.choice("format", ["pretty", "markdown", "json"] as const).pipe(
  Flag.withDescription("Output format: pretty, markdown, or json"),
  Flag.withDefault("pretty")
)

export const filesFlag = Flag.string("files").pipe(
  Flag.withDescription("Vault scope glob; repeat to include multiple patterns"),
  Flag.between(0, Number.MAX_SAFE_INTEGER)
)

export const fileFlag = Flag.string("file").pipe(
  Flag.withDescription("Markdown file path to analyze within the selected scope; repeat to include multiple files"),
  Flag.between(0, Number.MAX_SAFE_INTEGER)
)

export const scopeFlags = {
  files: filesFlag,
  file: fileFlag
} as const

export type ScopeFlags = {
  readonly files: ReadonlyArray<string>
  readonly file: ReadonlyArray<string>
}

export const vaultScopeFromFlags = (flags: ScopeFlags): VaultScope =>
  flags.files.length === 0 ? allMarkdown : fromPatterns(flags.files)

export const selectedFilesFromFlags = (flags: ScopeFlags): Chunk.Chunk<string> => Chunk.fromIterable(flags.file)

export const dataviewSourcesFromFlags = (flags: ScopeFlags): ReadonlyArray<string> => {
  if (flags.file.length > 0) {
    return flags.file
  }
  if (flags.files.length > 0) {
    return flags.files
  }
  return ["."]
}

export type { OutputFormat }

export const rendererLayerForFormat = (format: OutputFormat): Layer.Layer<DataviewRenderer> => {
  switch (format) {
    case "pretty":
      return DataviewRenderer.layerPretty
    case "markdown":
      return DataviewRenderer.layerMarkdown
    case "json":
      return DataviewRenderer.layerJson
  }
}
