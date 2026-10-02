import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { parsers as markdown } from 'prettier/plugins/markdown';
import { parsers as yaml } from 'prettier/plugins/yaml';
import { parsers as html } from 'prettier/plugins/html';

export function parseFrontmatter(text, label = 'document') {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { errors: [`${label}: missing frontmatter`], values: {} };

  const values = Object.create(null);
  const errors = [];
  try {
    const documents = yaml.yaml.parse(match[1]).children;
    if (documents.length !== 1) throw new Error('expected one YAML mapping');
    const mapping = documents[0].children.find((node) => node.type === 'documentBody')?.children;
    if (mapping?.length !== 1 || mapping[0].type !== 'mapping')
      throw new Error('expected one YAML mapping');
    for (const item of mapping[0].children) {
      const key = yamlValue(item.children[0].children[0]);
      if (typeof key !== 'string' || !/^[a-z_]+$/.test(key))
        throw new Error('invalid frontmatter key');
      if (Object.hasOwn(values, key)) errors.push(`${label}: duplicate frontmatter field ${key}`);
      const valueNode = item.children[1].children[0];
      values[key] = valueNode ? yamlValue(valueNode) : null;
    }
  } catch (cause) {
    errors.push(`${label}: invalid frontmatter: ${cause.message}`);
  }
  return { errors, values };
}

function yamlValue(node) {
  if (node.anchor || node.tag) throw new Error('YAML anchors and tags are unsupported');
  if (node.type === 'sequence') return node.children.map((item) => yamlValue(item.children[0]));
  if (['quoteDouble', 'quoteSingle'].includes(node.type)) return node.value;
  if (['blockLiteral', 'blockFolded'].includes(node.type)) return node.value;
  if (node.type !== 'plain') throw new Error(`unsupported YAML value ${node.type}`);
  if (/^(null|~)$/i.test(node.value)) return null;
  if (/^(true|false)$/i.test(node.value)) return node.value.toLowerCase() === 'true';
  if (/^-?\d+(?:\.\d+)?$/.test(node.value)) return Number(node.value);
  return node.value;
}

export function collectContractIds(documents) {
  const ids = new Set();
  const errors = [];
  for (const [label, text] of documents) {
    const frontmatter = parseFrontmatter(text, label);
    const body = withoutFencedCode(text);
    errors.push(...frontmatter.errors);
    if (!/^## \d*\.?\s*Contract catalog/m.test(body) && !/^## Contract catalog/m.test(body)) {
      errors.push(`${label}: missing Contract catalog`);
    }
    for (const match of body.matchAll(/\| `([A-Z]{2,}-[A-Z]+-\d{3})` \|/g)) {
      if (ids.has(match[1])) errors.push(`${label}: duplicate Contract ID ${match[1]}`);
      ids.add(match[1]);
    }
    if (!/^## \d*\.?\s*Revision log/m.test(body) && !/^## Revision log/m.test(body)) {
      errors.push(`${label}: missing Revision log`);
    } else if (
      typeof frontmatter.values.document_version === 'string' &&
      !new RegExp(
        `^\\| ${frontmatter.values.document_version.replaceAll('.', '\\.')} \\|`,
        'm',
      ).test(body)
    ) {
      errors.push(
        `${label}: current v${frontmatter.values.document_version} missing from Revision log`,
      );
    }
  }
  return { ids, errors };
}

export function validateRegistry(
  registryPath,
  registryText,
  readText = (path) => readFileSync(path, 'utf8'),
) {
  const errors = [];
  const parsedRegistry = analyzeMarkdown(registryText, 'registry');
  errors.push(...parsedRegistry.errors);
  for (const row of documentRows(parsedRegistry.ast)) {
    const link = row.link;
    if (!link || row.columns !== 3) {
      errors.push('registry: invalid document row');
      continue;
    }
    let local;
    try {
      local = decodeURIComponent(link.split('#')[0]);
    } catch {
      errors.push(`registry: invalid encoded path ${link}`);
      continue;
    }
    const version = row.declaration.match(/\bv(\d+\.\d+\.\d+)\b/);
    const rootKind = new Map([
      ['../README.md', '開発入口'],
      ['../AGENTS.md', '作業規約'],
      ['../CLAUDE.md', 'alias'],
    ]).get(local);
    if (rootKind) {
      if (row.declaration.split('／')[0].trim() !== rootKind)
        errors.push(`registry: ${link} invalid root kind`);
      continue;
    }
    if (!version) errors.push(`registry: ${link} missing document version`);
    const target = resolve(dirname(registryPath), local);
    let targetText;
    try {
      targetText = readText(target);
    } catch {
      errors.push(`registry: missing ${link}`);
      continue;
    }
    const parsed = parseFrontmatter(targetText, link);
    errors.push(...parsed.errors);
    if (version && parsed.values.document_version !== version[1]) {
      errors.push(
        `registry: ${link} declares v${version[1]} but frontmatter is v${parsed.values.document_version ?? 'missing'}`,
      );
    }
    const expectedStatus = row.declaration.match(/／([^\s／]+)(?:\s|$)/)?.[1];
    if (!expectedStatus) errors.push(`registry: ${link} missing status`);
    if (expectedStatus && parsed.values.status !== expectedStatus) {
      errors.push(
        `registry: ${link} declares ${expectedStatus} but frontmatter is ${parsed.values.status ?? 'missing'}`,
      );
    }
  }
  return errors;
}

function adrStatus(text) {
  return parseFrontmatter(text).values.status;
}

export function validateAdrIndex(
  indexPath,
  indexText,
  readText = (path) => readFileSync(path, 'utf8'),
  adrFiles = [],
) {
  const errors = [];
  const allowed = new Set(['accepted', 'superseded']);
  const indexedFiles = new Set();
  const indexedIds = new Set();
  const parsedIndex = analyzeMarkdown(indexText, 'ADR index');
  errors.push(...parsedIndex.errors);
  for (const row of documentRows(parsedIndex.ast)) {
    const { label: id, link, declaration: declaredValue } = row;
    if (!link || row.columns < 3) {
      errors.push('ADR index: invalid document row');
      continue;
    }
    if (!/^\d{3}$/.test(id)) {
      errors.push(`ADR index: invalid ID ${id}`);
      continue;
    }
    let local;
    try {
      local = decodeURIComponent(link.split('#')[0]);
    } catch {
      errors.push(`ADR-${id}: invalid encoded index path ${link}`);
      continue;
    }
    if (!new RegExp(`^${id}(?:-.+)?\\.md$`).test(local))
      errors.push(`ADR-${id}: index ID differs from path ${link}`);
    if (indexedFiles.has(local) || indexedIds.has(id))
      errors.push(`ADR-${id}: duplicate index entry ${link}`);
    indexedFiles.add(local);
    indexedIds.add(id);
    const declared = declaredValue.trim();
    if (!allowed.has(declared)) {
      errors.push(`ADR-${id}: invalid index status ${declared}`);
      continue;
    }
    let targetText;
    try {
      targetText = readText(resolve(dirname(indexPath), local));
    } catch {
      errors.push(`ADR-${id}: missing ${link}`);
      continue;
    }
    const actual = adrStatus(targetText);
    if (!actual || !allowed.has(actual)) {
      errors.push(`ADR-${id}: invalid document status ${actual ?? 'missing'}`);
    } else if (actual !== declared) {
      errors.push(`ADR-${id}: index status ${declared} differs from document ${actual}`);
    }
  }
  for (const file of adrFiles.filter((name) => /^\d{3}-.+\.md$/.test(name))) {
    if (!indexedFiles.has(file)) errors.push(`ADR index: unregistered ${file}`);
  }
  return errors;
}

function parseTaskIndex(tasksText, errors) {
  const tasks = new Map();
  const indexes = markdown.markdown
    .parse(tasksText)
    .children.filter(
      (node) =>
        node.type === 'table' &&
        nodeText(node.children[0].children[0]) === 'ID' &&
        nodeText(node.children[0].children[1]) === 'Task',
    );
  if (indexes.length > 1) errors.push('tasks: duplicate Task index');
  for (const table of indexes)
    for (const row of table.children.slice(1)) {
      const [id, title, rawStatus, dependency] = row.children.map(nodeText);
      if (row.children.length !== 5) errors.push(`tasks: malformed index row ${id}`);
      if (!title?.trim()) errors.push(`${id}: missing Task title`);
      if (!/^TSK-\d+(?:\.\d+)?$/.test(id)) errors.push(`tasks: invalid Task ID ${id}`);
      if (tasks.has(id)) errors.push(`tasks: duplicate Task ID ${id}`);
      const status = rawStatus?.trim();
      if (!['done', 'ready', 'blocked', 'in_progress'].includes(status))
        errors.push(`${id}: unknown Task status ${status}`);
      const dependencies =
        dependency?.trim() === '-' ? [] : (dependency ?? '').trim().split(/\s*,\s*/);
      if (new Set(dependencies).size !== dependencies.length)
        errors.push(`${id}: duplicate dependencies`);
      tasks.set(id, {
        title: title?.trim(),
        status,
        dependencies,
      });
    }
  return tasks;
}

function dependsTransitively(tasks, taskId, dependencyId, seen = new Set()) {
  if (taskId === dependencyId) return true;
  if (seen.has(taskId)) return false;
  seen.add(taskId);
  return (tasks.get(taskId)?.dependencies ?? []).some((parent) =>
    dependsTransitively(tasks, parent, dependencyId, seen),
  );
}

export function validateTaskPlan(tasksText, contractIds) {
  tasksText = withoutFencedCode(tasksText);
  const errors = [];
  const tasks = parseTaskIndex(tasksText, errors);
  if (tasks.size === 0) return ['tasks: empty Task index'];
  const inProgress = [...tasks].filter(([, task]) => task.status === 'in_progress');
  if (inProgress.length > 1) errors.push('tasks: more than one in_progress Task');

  const headings = [...tasksText.matchAll(/^### (TSK-[^:\s]+):[^\n]*$/gm)];
  const sections = new Map();
  for (const [index, heading] of headings.entries()) {
    const end = headings[index + 1]?.index ?? tasksText.length;
    if (sections.has(heading[1])) errors.push(`${heading[1]}: duplicate Task section`);
    if (!tasks.has(heading[1])) errors.push(`${heading[1]}: section missing from Task index`);
    sections.set(
      heading[1],
      tasksText.slice(heading.index + heading[0].length, end).split(/^## /m)[0],
    );
  }
  for (const [id, task] of tasks) {
    for (const dependency of task.dependencies) {
      const parent = tasks.get(dependency);
      if (!parent) errors.push(`${id}: unknown dependency ${dependency}`);
      if (dependency === id || (parent && dependsTransitively(tasks, dependency, id)))
        errors.push(`${id}: cyclic dependency ${dependency}`);
      if ((task.status === 'ready' || task.status === 'in_progress') && parent?.status !== 'done') {
        errors.push(`${id}: ${task.status} requires done dependency ${dependency}`);
      }
    }

    const section = sections.get(id);
    if (!section) {
      errors.push(`${id}: missing Task section`);
      continue;
    }
    const sectionDependencies = section.match(/^Depends on:\s*(.+)$/m)?.[1].trim();
    const indexDependencies = task.dependencies.length === 0 ? '-' : task.dependencies.join(', ');
    if (!sectionDependencies && task.status !== 'done')
      errors.push(`${id}: missing section dependency`);
    if (sectionDependencies && sectionDependencies !== indexDependencies) {
      errors.push(
        `${id}: section dependency ${sectionDependencies} differs from index ${indexDependencies}`,
      );
    }
    const current = [...section.matchAll(/^Current status:[^\n]*$/gm)];
    if (current.length > 1) errors.push(`${id}: duplicate Current status`);
    const currentStatus = current[0]?.[0].match(/^Current status:\s*`?([^\s`（。]+)`?/)?.[1];
    if (current.length && currentStatus !== task.status)
      errors.push(
        `${id}: Current status ${currentStatus ?? 'missing'} differs from index ${task.status}`,
      );
    if (!/^Handoff:\s*\S/m.test(section)) errors.push(`${id}: missing Handoff`);
    if (task.status === 'done' && /Handoff:\s*未記録/.test(section)) {
      errors.push(`${id}: done without Handoff`);
    }
    if (task.status === 'done') continue;

    const matrix = section.match(/Contract closure matrix:\s*\n\n([\s\S]*?)(?=\nHandoff:)/)?.[1];
    if (!matrix) {
      errors.push(`${id}: missing Contract closure matrix`);
      continue;
    }
    const rows = [...matrix.matchAll(/^\| `([^`]+)` \| ([^|]*) \| ([^|]*) \| ([^|]*) \|$/gm)];
    if (rows.length === 0) errors.push(`${id}: empty Contract closure matrix`);
    const seen = new Set();
    const candidates = matrix
      .split('\n')
      .filter((line) => /^\|/.test(line) && !/^\| (Contract ID|---)/.test(line));
    if (candidates.length !== rows.length) errors.push(`${id}: malformed Contract closure row`);
    for (const row of rows) {
      const [, contractId, disposition, command, artifact] = row;
      if (!contractIds.has(contractId)) errors.push(`${id}: unknown Contract ID ${contractId}`);
      if (seen.has(contractId)) errors.push(`${id}: duplicate Contract ID ${contractId}`);
      seen.add(contractId);
      const value = disposition.trim();
      if (!/^(Apply|N\/A: .+|Deferred: TSK-[0-9]+(?:\.[0-9]+)?)$/.test(value)) {
        errors.push(`${id}: invalid disposition for ${contractId}: ${value}`);
      }
      if (
        value === 'Apply' &&
        (!command.trim() || !artifact.trim() || command.trim() === '-' || artifact.trim() === '-')
      ) {
        errors.push(`${id}: Apply ${contractId} requires command and artifact`);
      }
      const deferred = value.match(/^Deferred: (TSK-[0-9]+(?:\.[0-9]+)?)$/)?.[1];
      if (deferred && !tasks.has(deferred)) errors.push(`${id}: unknown deferred Task ${deferred}`);
      if (
        deferred &&
        tasks.has(deferred) &&
        (deferred === id || !dependsTransitively(tasks, deferred, id))
      ) {
        errors.push(`${id}: ${contractId} deferred to non-descendant ${deferred}`);
      }
    }
  }
  return errors;
}

export function validateEvidenceRegistration(
  tasksText,
  evidenceIndexText,
  evidenceRoot,
  registered,
) {
  const errors = [];
  if (!(registered instanceof Set)) return ['evidence: missing registry reachability'];
  const source = analyzeMarkdown(tasksText, 'Tasks');
  errors.push(...source.errors);
  for (const reference of source.references) {
    const target = resolve(evidenceRoot, '..', 'tasks', reference.url.split('#')[0]);
    if (!target.startsWith(`${resolve(evidenceRoot)}${sep}`)) continue;
    if (!registered.has(target))
      errors.push(`evidence: ${reference.url} is referenced by Tasks but unregistered`);
  }
  const declaredCount = Number(evidenceIndexText.match(/tracked report (\d+)件/)?.[1]);
  const index = analyzeMarkdown(evidenceIndexText, 'evidence index');
  errors.push(...index.errors);
  const indexedCount = documentRows(index.ast).filter((row) =>
    row.link?.split('#')[0].endsWith('.md'),
  ).length;
  if (Number.isFinite(declaredCount) && declaredCount !== indexedCount) {
    errors.push(`evidence: declares ${declaredCount} reports but indexes ${indexedCount}`);
  }
  return errors;
}

export function inspectRepository(root) {
  const errors = [];
  const entries = new Map(
    execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
      .map((row) => {
        const match = row.match(/^(\d+) ([a-f\d]+) (\d+)\t([\s\S]+)$/);
        if (!match || match[3] !== '0') throw new Error('Git index is unmerged or malformed');
        return [match[4], { mode: match[1], object: match[2] }];
      }),
  );
  const documents = new Map();
  for (const [path, entry] of entries) {
    if (!/\.md$/i.test(path)) continue;
    if (protectedEnvironmentPath(path)) {
      errors.push(`${path}: protected environment path; not read`);
      continue;
    }
    if (path === 'CLAUDE.md') {
      try {
        if (
          entry.mode !== '120000' ||
          !lstatSync(resolve(root, path)).isSymbolicLink() ||
          readlinkSync(resolve(root, path)) !== 'AGENTS.md' ||
          execFileSync('git', ['cat-file', 'blob', entry.object], {
            cwd: root,
            encoding: 'utf8',
          }) !== 'AGENTS.md' ||
          !entries.has('AGENTS.md')
        )
          errors.push('CLAUDE.md: invalid alias; expected tracked mode120000 symlink to AGENTS.md');
      } catch (cause) {
        errors.push(`CLAUDE.md: invalid alias: ${cause.message}`);
      }
      continue;
    }
    try {
      if (!['100644', '100755'].includes(entry.mode) || !lstatSync(resolve(root, path)).isFile())
        throw new Error('expected tracked regular Markdown file');
      const real = relative(realpathSync(root), realpathSync(resolve(root, path)))
        .split(sep)
        .join('/');
      if (real === '..' || real.startsWith('../') || protectedEnvironmentPath(real))
        throw new Error('Markdown resolves outside repository or to a protected environment path');
      const text = readFileSync(resolve(root, path), 'utf8');
      const parsed = analyzeMarkdown(text, path);
      errors.push(...parsed.errors);
      documents.set(path, { text, ...parsed });
    } catch (cause) {
      errors.push(`${path}: ${cause.message}`);
    }
  }
  const registry = documents.get('docs/README.md');
  const declarations = registry ? registryDeclarations(registry.ast, errors) : new Map();
  const metadata = new Map();
  for (const [path, document] of documents) {
    const kind = documentKind(path, declarations.get(path)?.kind);
    if (!kind) errors.push(`${path}: unknown or contradictory document kind`);
    if (['開発入口', '作業規約'].includes(kind)) {
      if (!document.references.some(({ url }) => url === 'docs/README.md'))
        errors.push(`${path}: missing docs entry reference`);
      continue;
    }
    const parsed = parseFrontmatter(document.text, path);
    errors.push(...parsed.errors, ...validateMetadata(path, kind, parsed.values));
    metadata.set(path, { kind, values: parsed.values });
  }
  const edges = new Map();
  let referenceCount = 0;
  for (const [path, document] of documents) {
    const links = [...document.references, ...metadataReferences(metadata.get(path)?.values ?? {})];
    const targets = [];
    for (const reference of links) {
      referenceCount++;
      const target = resolveReference(root, path, reference, entries, documents, errors);
      if (target) targets.push(target);
    }
    edges.set(path, targets);
  }
  edges.set('CLAUDE.md', ['AGENTS.md']);
  const registered = new Set();
  const pending = ['docs/README.md'];
  while (pending.length) {
    const path = pending.pop();
    if (registered.has(path)) continue;
    registered.add(path);
    for (const target of edges.get(path) ?? [])
      if (target.endsWith('.md') || /^docs\/evidence\/.+\.json$/.test(target)) pending.push(target);
  }
  for (const path of entries.keys()) {
    if ((/\.md$/i.test(path) || /^docs\/evidence\/.+\.json$/.test(path)) && !registered.has(path))
      errors.push(`${path}: unregistered; unreachable from docs/README.md`);
  }
  const ledgers = [...metadata].filter(
    ([, { kind, values }]) => kind === 'Tasks' && values.status === 'Active',
  );
  if (ledgers.length > 1)
    errors.push(
      `tasks: more than one active Task ledger: ${ledgers.map(([path]) => path).join(', ')}`,
    );
  validateAdrMetadata(metadata, documents, errors);
  const readTracked = (absolute) => {
    const path = relative(root, absolute).split(sep).join('/');
    const document = documents.get(path);
    if (!document) throw new Error(`missing tracked Markdown ${path}`);
    return document.text;
  };
  const registryPath = resolve(root, 'docs/README.md');
  const tasksPath = resolve(root, 'docs/tasks/development-redesign-tasks.md');
  const evidencePath = resolve(root, 'docs/evidence/README.md');
  const adrIndexPath = resolve(root, 'docs/adr/README.md');
  const contractPaths = [
    'docs/requirements/fgo-lab-requirements-v0.3.md',
    'docs/requirements/ui-design-spec.md',
    'docs/requirements/test-strategy-redesign.md',
    'docs/requirements/ranking-self-and-conditional-effects-requirements.md',
    'docs/requirements/development-execution-efficiency-requirements.md',
    'docs/guides/document-governance.md',
  ];
  const contracts = contractPaths
    .filter((path) => {
      if (documents.has(path)) return true;
      errors.push(`${path}: missing Contract catalog owner`);
      return false;
    })
    .map((path) => [path, documents.get(path).text]);
  const catalog = collectContractIds(contracts);
  errors.push(...catalog.errors);
  for (const path of [registryPath, tasksPath, evidencePath, adrIndexPath])
    if (!documents.has(relative(root, path).split(sep).join('/')))
      errors.push(`${relative(root, path)}: missing required document`);
  for (const path of ['README.md', 'AGENTS.md', 'CLAUDE.md'])
    if (!entries.has(path)) errors.push(`${path}: missing required root kind`);
  if (registry) errors.push(...validateRegistry(registryPath, registry.text, readTracked));
  const adrIndex = documents.get('docs/adr/README.md');
  if (adrIndex)
    errors.push(
      ...validateAdrIndex(
        adrIndexPath,
        adrIndex.text,
        readTracked,
        [...entries.keys()]
          .filter((path) => /^docs\/adr\/\d{3}-.+\.md$/.test(path))
          .map((path) => path.slice('docs/adr/'.length)),
      ),
    );
  for (const [path] of ledgers)
    errors.push(
      ...validateTaskPlan(documents.get(path).text, catalog.ids).map(
        (error) => `${path}: ${error}`,
      ),
    );
  const tasks = documents.get('docs/tasks/development-redesign-tasks.md');
  const evidence = documents.get('docs/evidence/README.md');
  if (tasks && evidence)
    errors.push(
      ...validateEvidenceRegistration(
        tasks.text,
        evidence.text,
        resolve(root, 'docs/evidence'),
        new Set([...registered].map((path) => resolve(root, path))),
      ),
    );
  return {
    errors: [...new Set(errors)],
    counts: {
      markdown: [...entries.keys()].filter((path) => /\.md$/i.test(path)).length,
      machineEvidence: [...entries.keys()].filter((path) => /^docs\/evidence\/.+\.json$/.test(path))
        .length,
      references: referenceCount,
      registered: registered.size,
      activeLedgers: ledgers.length,
    },
  };
}

export function validateRepository(root) {
  return inspectRepository(root).errors;
}

const STATUS_BY_KIND = {
  requirement: ['Active', 'Proposed', 'Superseded'],
  registry: ['Active'],
  'sub-index': ['Active'],
  'license registry': ['Active'],
  Tasks: ['Active', 'Complete'],
  'phase plan': ['Active', 'Complete'],
  'task plan': ['Active', 'Complete'],
  evidence: ['Active', 'Complete', 'Superseded'],
  historical: ['Active', 'Complete', 'Superseded'],
  ADR: ['accepted', 'superseded'],
  guide: ['Guideline'],
};
const VERSIONED_KINDS = new Set([
  'requirement',
  'registry',
  'sub-index',
  'license registry',
  'Tasks',
  'phase plan',
  'task plan',
  'guide',
]);
const COMMON_FIELDS = ['title', 'status', 'document_version', 'created_at', 'updated_at'];
const FIELDS_BY_KIND = {
  requirement: [
    'approval',
    'approved_at',
    'supersedes',
    'ui_baseline',
    'related_adrs',
    'related_documents',
    'source_requirements',
    'refactoring_contract',
    'calculation_contract',
    'implementation_tasks',
  ],
  registry: [],
  'sub-index': [],
  'license registry': [],
  Tasks: ['source_requirements', 'source_plans', 'governance_contract'],
  'phase plan': ['execution_tasks', 'governing_documents'],
  'task plan': [
    'task',
    'baseline_commit',
    'current_worktree_base',
    'previous_bounded_unit_base',
    'parent_plan',
  ],
  guide: ['related_documents', 'governing_decisions'],
  ADR: ['date', 'recorded_commit', 'approved_at', 'amended_at', 'supersedes', 'superseded_by'],
  evidence: [
    'date',
    'historical_status',
    'status_scope',
    'superseded_by',
    'schema_version',
    'engine_version',
    'master_data_version',
    'baseline_commit',
    'baseline_head',
    'implementation_task',
    'source',
  ],
  historical: [
    'date',
    'historical_status',
    'status_scope',
    'superseded_by',
    'baseline_commit',
    'baseline_head',
  ],
};
const PATH_FIELDS = new Set([
  'related_adrs',
  'related_documents',
  'governing_decisions',
  'governing_documents',
  'source_plans',
  'governance_contract',
  'execution_tasks',
  'parent_plan',
  'refactoring_contract',
  'calculation_contract',
  'implementation_tasks',
]);
const SEQUENCE_FIELDS = new Set([
  'related_adrs',
  'related_documents',
  'governing_decisions',
  'governing_documents',
  'source_plans',
]);

function documentKind(path, declared) {
  let kind;
  if (path === 'README.md') kind = '開発入口';
  else if (path === 'AGENTS.md') kind = '作業規約';
  else if (path === 'CLAUDE.md') kind = 'alias';
  else if (path === 'docs/README.md') kind = 'registry';
  else if (
    /^docs\/(requirements|adr|tasks|evidence|guides|archive|licenses)\/README\.md$/.test(path)
  )
    kind = 'sub-index';
  else if (/^docs\/requirements\/[^/]+\.md$/.test(path)) kind = 'requirement';
  else if (/^docs\/adr\/\d{3}-[^/]+\.md$/.test(path)) kind = 'ADR';
  else if (/^docs\/evidence\/[^/]+\.md$/.test(path)) kind = 'evidence';
  else if (/^docs\/guides\/[^/]+\.md$/.test(path)) kind = 'guide';
  else if (/^docs\/licenses\/[^/]+\.md$/.test(path)) kind = 'license registry';
  else if (/^docs\/archive\/[^/]+\.md$/.test(path)) kind = 'historical';
  else if (path === 'docs/tasks/development-redesign-tasks.md') kind = 'Tasks';
  else if (path === 'docs/tasks/documentation-maintenance-phases.md') kind = 'phase plan';
  else if (
    /^docs\/tasks\/[^/]+\.md$/.test(path) &&
    ['Tasks', 'phase plan', 'task plan'].includes(declared)
  )
    kind = declared;
  return kind && (!declared || declared === kind) ? kind : null;
}

function validateMetadata(path, kind, values) {
  const errors = [];
  const allowed = new Set([...COMMON_FIELDS, ...(FIELDS_BY_KIND[kind] ?? [])]);
  const required = [
    'title',
    'status',
    ...(VERSIONED_KINDS.has(kind) ? ['document_version', 'updated_at'] : []),
  ];
  for (const key of required)
    if (!Object.hasOwn(values, key)) errors.push(`${path}: missing metadata ${key}`);
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key))
      errors.push(`${path}: unknown metadata field ${key} for ${kind ?? 'unknown kind'}`);
    const strings = Array.isArray(value) ? value : [value];
    const sequenceAllowed =
      SEQUENCE_FIELDS.has(key) ||
      key === 'supersedes' ||
      (key === 'source_requirements' && kind === 'Tasks');
    if (key === 'schema_version') {
      if (!Number.isSafeInteger(value) || value <= 0)
        errors.push(`${path}: invalid schema_version`);
    } else if (
      (Array.isArray(value) && (!sequenceAllowed || value.length === 0)) ||
      (SEQUENCE_FIELDS.has(key) && !Array.isArray(value)) ||
      strings.some((item) => typeof item !== 'string' || item.trim().length === 0)
    )
      errors.push(`${path}: invalid metadata value ${key}`);
    if (Array.isArray(value) && new Set(value).size !== value.length)
      errors.push(`${path}: duplicate values in ${key}`);
    if (
      ['date', 'created_at', 'updated_at', 'approved_at', 'amended_at'].includes(key) &&
      (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      errors.push(`${path}: invalid calendar date ${key}`);
    if (key === 'document_version' && (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)))
      errors.push(`${path}: invalid document_version`);
  }
  if (kind && !STATUS_BY_KIND[kind]?.includes(values.status))
    errors.push(`${path}: invalid ${kind} status ${values.status ?? 'missing'}`);
  if (Object.hasOwn(values, 'historical_status') && !Object.hasOwn(values, 'status_scope'))
    errors.push(`${path}: historical_status requires status_scope`);
  if (Object.hasOwn(values, 'approval')) {
    if (!['retained', 'required', 'approved'].includes(values.approval))
      errors.push(`${path}: unknown approval ${values.approval}`);
    if (values.approval === 'approved' && !values.approved_at)
      errors.push(`${path}: approved requires approved_at`);
  }
  if (kind === 'ADR') {
    if (!values.date && !values.recorded_commit)
      errors.push(`${path}: missing date or recorded_commit`);
    if (values.recorded_commit && !/^[a-f\d]{40}$/.test(values.recorded_commit))
      errors.push(`${path}: invalid recorded_commit`);
    if (values.status === 'superseded' && !values.superseded_by)
      errors.push(`${path}: superseded ADR missing superseded_by`);
    if (values.status === 'accepted' && values.superseded_by)
      errors.push(`${path}: accepted ADR has superseded_by`);
  } else if (Object.hasOwn(values, 'superseded_by')) {
    if (values.status !== 'Superseded') errors.push(`${path}: superseded_by contradicts status`);
    if (
      typeof values.superseded_by !== 'string' ||
      !/^docs\/[^\s#?]+\.(md|json)$/.test(values.superseded_by) ||
      values.superseded_by === path
    )
      errors.push(`${path}: invalid successor path superseded_by`);
  }
  if (
    Object.hasOwn(values, 'implementation_task') &&
    (typeof values.implementation_task !== 'string' ||
      !/^docs\/tasks\/[^\s]+\.md TSK-\d+(?:\.\d+)?$/.test(values.implementation_task))
  )
    errors.push(`${path}: invalid implementation_task reference`);
  return errors;
}

function metadataReferences(values) {
  const references = [];
  for (const [key, value] of Object.entries(values)) {
    if (key === 'implementation_task' && typeof value === 'string' && value.includes(' '))
      references.push({ url: value.split(' ')[0], rootRelative: true, line: `metadata.${key}` });
    if (
      PATH_FIELDS.has(key) ||
      (key === 'source_requirements' && Array.isArray(value)) ||
      (key === 'superseded_by' && typeof value === 'string' && value.startsWith('docs/'))
    ) {
      for (const url of Array.isArray(value) ? value : [value])
        if (typeof url === 'string')
          references.push({ url, rootRelative: true, line: `metadata.${key}` });
    }
  }
  return references;
}

function validateAdrMetadata(metadata, documents, errors) {
  const adrs = new Map(
    [...metadata]
      .filter(([, info]) => info.kind === 'ADR')
      .map(([path, info]) => [`ADR-${path.match(/\/(\d{3})-/)[1]}`, { path, ...info }]),
  );
  for (const [id, { path, values }] of adrs) {
    const body = withoutFencedCode(
      documents.get(path).text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ''),
    );
    const statuses = [...body.matchAll(/^(?:-\s*)?Status:\s*(.+)$/gm)].map((match) =>
      match[1].trim(),
    );
    for (const match of body.matchAll(/^## Status\s*\n+([^\n]+)/gm)) statuses.push(match[1].trim());
    if (statuses.length > 1) errors.push(`${path}: duplicate ADR body status`);
    for (const status of statuses)
      if (status !== values.status)
        errors.push(`${path}: ADR body status ${status} differs from metadata ${values.status}`);
    const dates = [...body.matchAll(/^(?:-\s*)?Date:\s*(.+)$/gm)].map((match) => match[1].trim());
    if (dates.length > 1) errors.push(`${path}: duplicate ADR body date`);
    for (const date of dates)
      if (date !== values.date)
        errors.push(`${path}: ADR body date ${date} differs from metadata ${values.date}`);
    for (const targetId of [
      ...(Object.hasOwn(values, 'superseded_by') ? [values.superseded_by] : []),
      ...(Array.isArray(values.supersedes)
        ? values.supersedes
        : values.supersedes
          ? [values.supersedes]
          : []),
    ]) {
      if (
        typeof targetId !== 'string' ||
        !/^ADR-\d{3}$/.test(targetId) ||
        !adrs.has(targetId) ||
        targetId === id
      )
        errors.push(`${path}: invalid ADR replacement ${targetId}`);
    }
    const visited = new Set([id]);
    let successor = values.superseded_by;
    while (successor && adrs.has(successor)) {
      if (visited.has(successor)) {
        errors.push(`${path}: cyclic ADR replacement ${successor}`);
        break;
      }
      visited.add(successor);
      successor = adrs.get(successor).values.superseded_by;
    }
    for (const predecessor of Array.isArray(values.supersedes)
      ? values.supersedes
      : values.supersedes
        ? [values.supersedes]
        : []) {
      if (adrs.has(predecessor) && adrs.get(predecessor).values.superseded_by !== id)
        errors.push(`${path}: supersedes ${predecessor} contradicts predecessor metadata`);
    }
  }
}

function nodeText(node) {
  return !node || node.type === 'html'
    ? ''
    : node.type === 'image'
      ? node.alt
      : (node.value ?? (node.children ?? []).map(nodeText).join(''));
}

function withoutFencedCode(text) {
  const ast = markdown.markdown.parse(text);
  const ranges = [];
  const visit = (node) => {
    if (node.type === 'code') ranges.push([node.position.start.offset, node.position.end.offset]);
    else for (const child of node.children ?? []) visit(child);
  };
  visit(ast);
  let result = text;
  for (const [start, end] of ranges.reverse())
    result =
      result.slice(0, start) +
      result.slice(start, end).replace(/[^\r\n]/g, ' ') +
      result.slice(end);
  return result;
}

function documentRows(ast) {
  return ast.children
    .filter((node) => node.type === 'table')
    .flatMap((table) =>
      table.children.slice(1).map((row) => {
        const links = [];
        const visit = (node) => {
          if (['link', 'linkReference'].includes(node.type)) links.push(node);
          else for (const child of node.children ?? []) visit(child);
        };
        visit(row.children[0]);
        return links.length === 1 && links[0].url
          ? {
              link: links[0].url,
              label: nodeText(links[0]),
              declaration: nodeText(row.children[1]),
              columns: row.children.length,
            }
          : {
              link: null,
              label: nodeText(row.children[0]),
              declaration: nodeText(row.children[1]),
              columns: row.children.length,
            };
      }),
    );
}

function registryDeclarations(ast, errors) {
  const declarations = new Map();
  for (const row of documentRows(ast)) {
    if (!row.link || row.columns !== 3) {
      errors.push('docs/README.md: invalid registry row');
      continue;
    }
    let path;
    try {
      path = relative('.', resolve('docs', decodeURIComponent(row.link.split('#')[0])))
        .split(sep)
        .join('/');
    } catch {
      errors.push(`docs/README.md: invalid encoded registry path ${row.link}`);
      continue;
    }
    const kind = row.declaration.split('／')[0].trim();
    if (declarations.has(path)) errors.push(`${path}: duplicate registry declaration`);
    declarations.set(path, { kind });
  }
  for (const path of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/README.md'])
    if (!declarations.has(path)) errors.push(`${path}: missing registry declaration`);
  return declarations;
}

export function analyzeMarkdown(text, path) {
  const ast = markdown.markdown.parse(text);
  const errors = [],
    references = [],
    anchors = new Set(),
    definitions = new Map(),
    uses = [];
  const known = new Set([
    'root',
    'heading',
    'text',
    'list',
    'listItem',
    'paragraph',
    'link',
    'image',
    'definition',
    'linkReference',
    'imageReference',
    'code',
    'inlineCode',
    'table',
    'tableRow',
    'tableCell',
    'blockquote',
    'thematicBreak',
    'break',
    'strong',
    'emphasis',
    'delete',
    'html',
    'frontMatter',
  ]);
  const visit = (node) => {
    const line = node.position?.start.line;
    if (!known.has(node.type))
      errors.push(`${path}:${line}: unsupported Markdown syntax ${node.type}`);
    if (['code', 'inlineCode', 'frontMatter'].includes(node.type)) return;
    if (node.type === 'heading') {
      const base = nodeText(node)
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '')
        .replace(/\s/g, '-');
      let anchor = base,
        suffix = 0;
      while (anchors.has(anchor)) anchor = `${base}-${++suffix}`;
      anchors.add(anchor);
    }
    if (['link', 'image', 'definition'].includes(node.type))
      references.push({ url: node.url, line });
    if (node.type === 'definition') {
      if (definitions.has(node.identifier))
        errors.push(`${path}:${line}: duplicate reference definition ${node.identifier}`);
      definitions.set(node.identifier, node.url);
    }
    if (['linkReference', 'imageReference'].includes(node.type)) uses.push(node);
    if (node.type === 'html') inspectHtml(node.value, path, line, references, anchors, errors);
    if (node.type === 'text') {
      const raw = text.slice(node.position.start.offset, node.position.end.offset);
      if (/(?<!\\)\]\s*(?:\(|\[)/.test(raw) || /(?<!\\)!\[[^\]]+\]/.test(raw))
        errors.push(`${path}:${line}: malformed or unresolved Markdown reference`);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(ast);
  for (const node of uses) {
    if (!definitions.has(node.identifier))
      errors.push(`${path}:${node.position.start.line}: unresolved reference ${node.identifier}`);
    else {
      node.url = definitions.get(node.identifier);
      references.push({ url: node.url, line: node.position.start.line });
    }
  }
  return { ast, errors, references, anchors };
}

function inspectHtml(value, path, line, references, anchors, errors) {
  // Closing fragments and comments do not generate a reference.
  if (/^<\/[a-z][\w:-]*\s*>$/i.test(value) || /^<!--[\s\S]*-->$/.test(value)) return;
  try {
    const parsed = html.html.parse(value);
    const visit = (node) => {
      if (node.kind === 'element') {
        const tag = node.name.toLowerCase();
        if (['script', 'style', 'base'].includes(tag))
          throw new Error(`unsupported HTML element ${node.name}`);
        const seen = new Set();
        for (const attr of node.attrs) {
          const name = attr.name.toLowerCase();
          if (seen.has(name)) throw new Error(`duplicate HTML attribute ${attr.name}`);
          seen.add(name);
          if (
            [
              'href',
              'src',
              'poster',
              'data',
              'action',
              'formaction',
              'cite',
              'background',
              'longdesc',
              'xlink:href',
              'usemap',
              'manifest',
            ].includes(name)
          )
            references.push({ url: htmlAttributeValue(attr), line });
          else if (
            ['srcset', 'style', 'srcdoc', 'ping', 'archive', 'codebase', 'profile'].includes(
              name,
            ) ||
            name.startsWith('[') ||
            name.startsWith('on')
          )
            throw new Error(`unsupported HTML reference attribute ${attr.name}`);
          else if (name === 'id' || (name === 'name' && tag === 'a')) {
            const value = htmlAttributeValue(attr);
            if (!value || anchors.has(value))
              throw new Error(`duplicate or empty HTML anchor ${value}`);
            anchors.add(value);
          }
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(parsed);
  } catch (cause) {
    errors.push(`${path}:${line}: invalid HTML reference: ${cause.message}`);
  }
}

function htmlAttributeValue(attr) {
  if (!Array.isArray(attr.valueTokens))
    throw new Error(`unsupported HTML attribute syntax ${attr.name}`);
  return attr.valueTokens
    .map((token) => {
      if (![17, 9].includes(token.type)) throw new Error(`dynamic HTML reference ${attr.name}`);
      return token.parts[0];
    })
    .join('');
}

function protectedEnvironmentPath(path) {
  return path
    .split('/')
    .some((part) => part !== '.env.example' && (part === '.env' || part.startsWith('.env.')));
}

function resolveReference(root, source, reference, entries, documents, errors) {
  const label = `${source}:${reference.line}`;
  const url = reference.url;
  if (typeof url !== 'string' || url.length === 0) {
    errors.push(`${label}: empty reference`);
    return null;
  }
  if (/^(https?:\/\/|mailto:)/i.test(url) || /^\/\//.test(url)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
    errors.push(`${label}: unsupported reference scheme ${url}`);
    return null;
  }
  try {
    const hash = url.indexOf('#');
    const local = hash < 0 ? url : url.slice(0, hash);
    const fragment = hash < 0 ? null : decodeURIComponent(url.slice(hash + 1));
    if (local.includes('?')) throw new Error('local query reference is unsupported');
    const decoded = decodeURIComponent(local);
    if (/[\0\r\n\\]/.test(decoded) || decoded.startsWith('/'))
      throw new Error('invalid local path');
    const absolute = resolve(
      root,
      reference.rootRelative ? '.' : dirname(source),
      decoded || (reference.rootRelative ? source : source.split('/').at(-1)),
    );
    const target = relative(root, absolute).split(sep).join('/');
    if (target === '..' || target.startsWith('../'))
      throw new Error('reference escapes repository');
    if (protectedEnvironmentPath(target)) throw new Error('protected environment path');
    if (!entries.has(target)) throw new Error(`untracked target ${target}`);
    const real = relative(realpathSync(root), realpathSync(absolute));
    if (real === '..' || real.startsWith(`..${sep}`))
      throw new Error('target resolves outside repository');
    if (protectedEnvironmentPath(real.split(sep).join('/')))
      throw new Error('target resolves to protected environment path');
    if (!lstatSync(absolute).isFile() && target !== 'CLAUDE.md')
      throw new Error('target is not a regular file');
    if (fragment !== null && fragment.length > 0) {
      const doc = documents.get(target === 'CLAUDE.md' ? 'AGENTS.md' : target);
      if (!doc) throw new Error(`unsupported fragment on non-Markdown target ${target}`);
      if (!doc.anchors.has(fragment)) throw new Error(`missing anchor ${target}#${fragment}`);
    }
    return target;
  } catch (cause) {
    errors.push(`${label}: ${url}: ${cause.message}`);
    return null;
  }
}
