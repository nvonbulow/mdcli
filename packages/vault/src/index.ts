export * as Markdown from "./markdown/Markdown"
export * as MarkdownModel from "./markdown/MarkdownModel"
export { MarkdownParser, type MarkdownParserService } from "./markdown/MarkdownParser"
export * from "./VaultScope"
export * as Glob from "./Glob"
export { VaultService } from "./VaultService"
export { Vault, type VaultFiles } from "./Vault"
export {
  diagnostics,
  fencedBlockRecordsForFile,
  fencedBlocks,
  filterVault,
  frontmatter,
  frontmatterRecordsForFile,
  headingRecordsForFile,
  headings,
  linkRecordsForFile,
  links,
  listItemRecordsForFile,
  listItems,
  noteRecordsForFile,
  notes,
  tagRecordsForFile,
  tags,
  type VaultDiagnostic,
  type VaultFencedBlockRecord,
  type VaultFrontmatterRecord,
  type VaultHeadingRecord,
  type VaultLinkRecord,
  type VaultListItemRecord,
  type VaultNoteRecord,
  type VaultRecord,
  type VaultTagRecord
} from "./VaultProjections"
export { search, type VaultSearchResult } from "./VaultSearch"
export { sourceExcerpt, sourceLine } from "./VaultSource"
export * from "./VaultErrors"
