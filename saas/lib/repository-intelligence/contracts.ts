export type RepositoryLanguage = 'typescript' | 'tsx' | 'javascript' | 'jsx' | 'json' | 'markdown' | 'yaml' | 'css' | 'html' | 'sql' | 'python' | 'shell' | 'unknown'
export type RepositorySymbolKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'route_handler' | 'default_export'
export type ExclusionReason = 'excluded_directory' | 'secret_like' | 'hidden' | 'symbolic_link' | 'binary' | 'file_too_large' | 'total_byte_limit' | 'file_count_limit' | 'depth_limit' | 'outside_root'
export interface RepositoryScanOptions { repositoryRoot: string; maximumFiles?: number; maximumFileSizeBytes?: number; maximumTotalBytes?: number; maximumDirectoryDepth?: number; includeHiddenFiles?: boolean; readBinaryFiles?: boolean; followSymbolicLinks?: boolean; repositoryWrites?: boolean; networkAccess?: boolean; excludedDirectoryNames?: readonly string[]; secretPatterns?: readonly string[] }
export interface PackageBoundary { relativePath: string; marker: 'package.json' | 'tsconfig.json' | 'pyproject.toml' | 'Cargo.toml' | 'go.mod' }
export interface TestFileMetadata { relativePath: string; frameworkHint: string | null }
export interface RepositoryFileEntry { relativePath: string; language: RepositoryLanguage; sizeBytes: number; packageBoundary: string | null; isTest: boolean; isGenerated: boolean }
export interface ScanWarning { relativePath: string | null; code: string; message: string }
export interface ScanStatistics { filesVisited: number; filesIncluded: number; bytesInspected: number; filesExcluded: number }
export interface RepositoryManifest { files: readonly RepositoryFileEntry[]; packageBoundaries: readonly PackageBoundary[]; testFiles: readonly TestFileMetadata[]; warnings: readonly ScanWarning[]; statistics: ScanStatistics }
export interface RepositorySymbol { name: string; kind: RepositorySymbolKind; exported: boolean; relativePath: string; line: number | null }
export interface ImportedSymbol { name: string; importedName: string; relativePath: string; line: number | null; moduleSpecifier: string }
export interface ImportRelationship { from: string; specifier: string; to: string | null; importedSymbols: readonly ImportedSymbol[]; unresolved: boolean }
export interface FileDependencyGraph { nodes: readonly string[]; imports: readonly ImportRelationship[]; reverseDependencies: Readonly<Record<string, readonly string[]>>; cycles: readonly (readonly string[])[]; testToSource: Readonly<Record<string, readonly string[]>> }
export interface SymbolDependencyGraph { symbols: readonly RepositorySymbol[]; imports: readonly ImportedSymbol[] }
export interface ContextSelectionRequest { taskDescription: string; pathHints?: readonly string[]; symbolHints?: readonly string[]; maximumFiles?: number; maximumTotalBytes?: number }
export interface SelectedContextFile { relativePath: string; score: number; reasons: readonly string[]; excerpt: string | null; sizeBytes: number }
export interface ContextSelectionResult { files: readonly SelectedContextFile[]; warnings: readonly ScanWarning[]; totalBytes: number }
