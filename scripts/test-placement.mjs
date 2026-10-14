import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import {
  AUDIT_TEST_INCLUDES,
  PRODUCTION_TEST_INCLUDES,
  UNIT_DIAGNOSTIC_TEST_INCLUDES,
} from './test-suites.mjs';

// These test the diagnostic writer's contract with small local values, rather than preserving
// a complete execution diagnostic. Other writer callers belong to a serial diagnostic suite.
const DIAGNOSTIC_WRITER_CONTRACT_TESTS = new Set([
  'packages/calculation-application/src/productionAuditArtifacts.test.ts',
  'packages/calculation-application/src/productionAuditDiagnosticEquality.test.ts',
]);

function testFiles(root, directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return testFiles(root, path);
    return /\.test\.(?:ts|tsx)$/.test(entry.name)
      ? [relative(root, path).split(sep).join('/')]
      : [];
  });
}

function testResponsibilities(path, source) {
  const ast = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let readsPublishedMaster = false;
  let writesDiagnostic = false;
  const makeScope = (container, parent) => {
    const scope = { parent, bindings: new Map() };
    const bind = (name, value) => scope.bindings.set(name, { value, scope });
    if (ts.isFunctionLike(container))
      for (const parameter of container.parameters)
        if (ts.isIdentifier(parameter.name)) bind(parameter.name.text, null);
    if (ts.isCatchClause(container) && container.variableDeclaration)
      if (ts.isIdentifier(container.variableDeclaration.name))
        bind(container.variableDeclaration.name.text, null);
    if (
      ts.isForStatement(container) ||
      ts.isForInStatement(container) ||
      ts.isForOfStatement(container)
    )
      if (container.initializer && ts.isVariableDeclarationList(container.initializer))
        for (const declaration of container.initializer.declarations)
          if (ts.isIdentifier(declaration.name))
            bind(declaration.name.text, declaration.initializer ?? null);
    if (ts.isSourceFile(container) || ts.isBlock(container))
      for (const statement of container.statements) {
        if (ts.isVariableStatement(statement))
          for (const declaration of statement.declarationList.declarations)
            if (ts.isIdentifier(declaration.name))
              bind(declaration.name.text, declaration.initializer ?? null);
        if (ts.isFunctionDeclaration(statement) && statement.name) bind(statement.name.text, null);
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
          const module = statement.moduleSpecifier.text;
          const clause = statement.importClause;
          if (clause?.name) bind(clause.name.text, null);
          const imports = clause?.namedBindings;
          if (imports && ts.isNamespaceImport(imports))
            bind(imports.name.text, ['node:fs', 'node:fs/promises'].includes(module) ? 'fs' : null);
          if (imports && ts.isNamedImports(imports))
            for (const entry of imports.elements) {
              const imported = (entry.propertyName ?? entry.name).text;
              const kind =
                ['node:fs', 'node:fs/promises'].includes(module) &&
                ['readFile', 'readFileSync'].includes(imported)
                  ? 'read'
                  : module.endsWith('/productionAuditArtifacts') &&
                      imported === 'writeProductionAuditArtifact'
                    ? 'writer'
                    : null;
              bind(entry.name.text, kind);
            }
        }
      }
    return scope;
  };
  const binding = (scope, name) => {
    for (let current = scope; current; current = current.parent)
      if (current.bindings.has(name)) return current.bindings.get(name);
    return null;
  };
  const hasMasterPath = (node, scope, seen = new Set()) => {
    if (ts.isStringLiteralLike(node) && node.text.includes('production-master/master.json'))
      return true;
    if (ts.isIdentifier(node)) {
      const resolved = binding(scope, node.text);
      if (!resolved || !resolved.value || typeof resolved.value === 'string' || seen.has(resolved))
        return false;
      seen.add(resolved);
      return hasMasterPath(resolved.value, resolved.scope, seen);
    }
    return ts.forEachChild(node, (child) => hasMasterPath(child, scope, new Set(seen))) ?? false;
  };
  const callableKind = (node, scope, seen = new Set()) => {
    if (ts.isIdentifier(node)) {
      const resolved = binding(scope, node.text);
      if (!resolved) return null;
      if (typeof resolved.value === 'string') return resolved.value;
      if (!resolved.value || seen.has(resolved)) return null;
      seen.add(resolved);
      return callableKind(resolved.value, resolved.scope, seen);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      callableKind(node.expression, scope, seen) === 'fs' &&
      ['readFile', 'readFileSync'].includes(node.name.text)
    )
      return 'read';
    return null;
  };
  const visit = (node, scope) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
      if (node.moduleSpecifier.text.includes('production-master/master.json'))
        readsPublishedMaster = true;
    if (ts.isCallExpression(node)) {
      const kind = callableKind(node.expression, scope);
      if (kind === 'read' && node.arguments[0] && hasMasterPath(node.arguments[0], scope))
        readsPublishedMaster = true;
      if (kind === 'writer') writesDiagnostic = true;
    }
    ts.forEachChild(node, (child) =>
      visit(
        child,
        ts.isSourceFile(child) ||
          ts.isBlock(child) ||
          ts.isFunctionLike(child) ||
          ts.isCatchClause(child) ||
          ts.isForStatement(child) ||
          ts.isForInStatement(child) ||
          ts.isForOfStatement(child)
          ? makeScope(child, scope)
          : scope,
      ),
    );
  };
  visit(ast, makeScope(ast, null));
  return { readsPublishedMaster, writesDiagnostic };
}

export function misplacedSpecialTests(root) {
  const productionOrAudit = new Set([...PRODUCTION_TEST_INCLUDES, ...AUDIT_TEST_INCLUDES]);
  const diagnostic = new Set(UNIT_DIAGNOSTIC_TEST_INCLUDES);
  return [...testFiles(root, resolve(root, 'packages')), ...testFiles(root, resolve(root, 'apps'))]
    .flatMap((file) => {
      const { readsPublishedMaster, writesDiagnostic } = testResponsibilities(
        file,
        readFileSync(resolve(root, file), 'utf8'),
      );
      const reasons = [];
      if (readsPublishedMaster && !productionOrAudit.has(file))
        reasons.push('published master read requires production/audit');
      if (
        writesDiagnostic &&
        !productionOrAudit.has(file) &&
        !diagnostic.has(file) &&
        !DIAGNOSTIC_WRITER_CONTRACT_TESTS.has(file)
      )
        reasons.push('diagnostic write requires unit-diagnostics/production/audit');
      return reasons.map((reason) => `${file}: ${reason}`);
    })
    .sort();
}
