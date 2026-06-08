import { Chunk, String as Str } from "effect"
import type { VaultHeadingRecord, VaultLinkRecord } from "@kb/vault-core"

export const matchingPaths = (
  notesByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  basenameByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  h1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  sourcePath: string,
  target: string
): ReadonlyArray<string> => {
  const paths = matchingGlobalPaths(notesByKey, basenameByKey, h1ByKey, target)
  if (paths.length > 0 || !isRelativePathQualifiedTarget(target)) {
    return paths
  }
  return sortedPaths(notesByKey.get(relativeTargetKey(sourcePath, target)) ?? Chunk.empty<string>())
}

export const sortedOtherPaths = (paths: Chunk.Chunk<string>, triggerPath: string): ReadonlyArray<string> =>
  sortedPaths(paths).filter((path) => path !== triggerPath)

export const sortedPaths = (paths: Chunk.Chunk<string>): ReadonlyArray<string> =>
  Array.from(new Set(Chunk.toReadonlyArray(paths))).sort(Str.Order)

export const linkFindingKey = (link: VaultLinkRecord, severity: "error" | "warning"): string =>
  `${severity}\u0000${link.path}\u0000${link.target}\u0000${link.original}\u0000${sourcePositionKey(link.position)}`

export const firstDepthOneHeading = (
  headings: Chunk.Chunk<VaultHeadingRecord>,
  path: string
): VaultHeadingRecord | undefined => {
  for (const heading of headings) {
    if (heading.path === path && heading.depth === 1) {
      return heading
    }
  }
  return undefined
}

export const basename = (path: string): string => {
  const normalized = Str.replaceAll("\\", "/")(path)
  const index = normalized.lastIndexOf("/")
  return index < 0 ? normalized : normalized.slice(index + 1)
}

export const titleFromPath = (path: string): string => {
  const name = basename(path)
  return Str.endsWith(".md")(name) ? name.slice(0, -3) : name
}

export const normalizeKey = (value: string): string => {
  const index = value.indexOf("#")
  const withoutHeading = index < 0 ? value : value.slice(0, index)
  const trimmed = Str.toLowerCase(Str.trim(withoutHeading))
  return Str.endsWith(".md")(trimmed) ? trimmed.slice(0, -3) : trimmed
}

export const isArchivePath = (path: string): boolean =>
  path.split("/").some((part) => part === "90-Archive" || part === "Archive")

const matchingGlobalPaths = (
  notesByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  basenameByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  h1ByKey: ReadonlyMap<string, Chunk.Chunk<string>>,
  target: string
): ReadonlyArray<string> => {
  const key = normalizeKey(target)
  const paths = new Set<string>()
  appendPaths(paths, notesByKey.get(key))
  appendPaths(paths, basenameByKey.get(key))
  appendPaths(paths, h1ByKey.get(key))
  return Array.from(paths).sort(Str.Order)
}

const appendPaths = (paths: Set<string>, values: Chunk.Chunk<string> | undefined): void => {
  if (values === undefined) {
    return
  }
  for (const path of values) {
    paths.add(path)
  }
}

const sourcePositionKey = (position: VaultLinkRecord["position"]): string =>
  position === undefined
    ? ""
    : `${position.start.line}:${position.start.column}:${position.start.offset ?? ""}-${position.end.line}:${position.end.column}:${
        position.end.offset ?? ""
      }`

const relativeTargetKey = (sourcePath: string, target: string): string => {
  const headingIndex = target.indexOf("#")
  const pathTarget = headingIndex < 0 ? target : target.slice(0, headingIndex)
  const heading = headingIndex < 0 ? "" : target.slice(headingIndex)
  const directory = dirname(sourcePath)
  return normalizeKey(`${normalizeRelativePath(directory, pathTarget)}${heading}`)
}

const isRelativePathQualifiedTarget = (target: string): boolean => {
  const pathTarget = target.slice(0, target.indexOf("#") < 0 ? target.length : target.indexOf("#"))
  return pathTarget.includes("/") && !pathTarget.startsWith("/")
}

const dirname = (path: string): string => {
  const normalized = Str.replaceAll("\\", "/")(path)
  const index = normalized.lastIndexOf("/")
  return index < 0 ? "" : normalized.slice(0, index)
}

const normalizeRelativePath = (directory: string, target: string): string => {
  const segments = `${directory.length === 0 ? target : `${directory}/${target}`}`.split("/")
  const normalized: Array<string> = []
  for (const segment of segments) {
    if (segment.length === 0 || segment === ".") {
      continue
    }
    if (segment === "..") {
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }
  return normalized.join("/")
}
