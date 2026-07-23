import ts from 'typescript'
import type { ImportedSymbol, RepositorySymbol, ScanWarning } from './contracts.ts'

export interface SymbolExtractionResult {
  symbols: readonly RepositorySymbol[]
  imports: readonly ImportedSymbol[]
  warnings: readonly ScanWarning[]
}

const supported = (path: string) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)
const line = (sourceFile: ts.SourceFile, node: ts.Node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
const exported = (node: ts.Node) =>
  Boolean(ts.getModifiers(node as ts.HasModifiers)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))

export function extractSymbols(relativePath: string, source: string): SymbolExtractionResult {
  if (!supported(relativePath)) return { symbols: [], imports: [], warnings: [] }

  const scriptKind = /\.tsx$/.test(relativePath)
    ? ts.ScriptKind.TSX
    : /\.(js|jsx|mjs|cjs)$/.test(relativePath)
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, scriptKind)
  const warnings: ScanWarning[] = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.map(diagnostic => ({
    relativePath,
    code: 'parse_failure',
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
  }))
  const symbols: RepositorySymbol[] = []
  const imports: ImportedSymbol[] = []

  const add = (
    name: string,
    kind: RepositorySymbol['kind'],
    node: ts.Node,
    isExported = exported(node),
  ) => {
    symbols.push({ name, kind, exported: isExported, relativePath, line: line(sourceFile, node) })
  }

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const moduleSpecifier = statement.moduleSpecifier.text
      const clause = statement.importClause
      if (clause?.name) {
        imports.push({
          name: clause.name.text,
          importedName: 'default',
          relativePath,
          line: line(sourceFile, clause.name),
          moduleSpecifier,
        })
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          imports.push({
            name: element.name.text,
            importedName: element.propertyName?.text ?? element.name.text,
            relativePath,
            line: line(sourceFile, element),
            moduleSpecifier,
          })
        }
      }
    }

    if (ts.isExportAssignment(statement)) {
      add('default', 'default_export', statement, true)
      continue
    }

    const name = 'name' in statement ? statement.name : undefined
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      add(statement.name.text, 'function', statement)
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      add(statement.name.text, 'class', statement)
    } else if (ts.isInterfaceDeclaration(statement)) {
      add(statement.name.text, 'interface', statement)
    } else if (ts.isTypeAliasDeclaration(statement)) {
      add(statement.name.text, 'type', statement)
    } else if (ts.isEnumDeclaration(statement)) {
      add(statement.name.text, 'enum', statement)
    } else if (ts.isVariableStatement(statement) && exported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) add(declaration.name.text, 'variable', statement, true)
      }
    }

    if (
      (ts.isFunctionDeclaration(statement) || ts.isVariableStatement(statement)) &&
      name &&
      ts.isIdentifier(name) &&
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(name.text) &&
      exported(statement)
    ) {
      add(name.text, 'route_handler', statement, true)
    }
  }

  return {
    symbols: symbols.sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.name.localeCompare(b.name),
    ),
    imports: imports.sort((a, b) =>
      (a.line ?? 0) - (b.line ?? 0) || a.name.localeCompare(b.name),
    ),
    warnings,
  }
}
