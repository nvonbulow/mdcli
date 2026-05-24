import { Chunk, Data } from "effect"

const markdownGlob = "**/*.md"
const markdownExtension = ".md"
const subtreeMarkdownGlob = "/**/*.md"

export class VaultScope extends Data.Class<{
  readonly patterns: Chunk.Chunk<string>
}> {}

export const isGlobPattern = (value: string): boolean =>
  value.includes("*") || value.includes("?") || value.includes("[")

const stripLeadingCurrentDirectory = (path: string): string => (path.startsWith("./") ? path.slice(2) : path)

const stripTrailingSlash = (path: string): string => (path.endsWith("/") ? path.slice(0, -1) : path)

const normalizePath = (path: string): string => stripTrailingSlash(stripLeadingCurrentDirectory(path))

export const allMarkdown = new VaultScope({ patterns: Chunk.of(markdownGlob) })

export const fromPattern = (pattern: string): VaultScope => new VaultScope({ patterns: Chunk.of(pattern) })

export const fromPatterns = (patterns: Iterable<string>): VaultScope =>
  new VaultScope({ patterns: Chunk.fromIterable(patterns) })

export const fromPath = (path: string): VaultScope => {
  const normalized = normalizePath(path)

  if (normalized === "" || normalized === ".") {
    return allMarkdown
  }

  if (isGlobPattern(normalized) || normalized.endsWith(markdownExtension)) {
    return fromPattern(normalized)
  }

  return fromPattern(`${normalized}${subtreeMarkdownGlob}`)
}
