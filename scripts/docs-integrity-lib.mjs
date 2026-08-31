import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function parseFrontmatter(text, label = 'document') {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { errors: [`${label}: missing frontmatter`], values: {} };

  const values = {};
  const duplicates = new Set();
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z_]+):\s*["']?([^"']*?)["']?\s*$/);
    if (!field) continue;
    if (Object.hasOwn(values, field[1])) duplicates.add(field[1]);
    values[field[1]] = field[2];
  }
  return {
    errors: [...duplicates].map((key) => `${label}: duplicate frontmatter field ${key}`),
    values,
  };
}

export function collectContractIds(documents) {
  const ids = new Set();
  const errors = [];
  for (const [label, text] of documents) {
    const frontmatter = parseFrontmatter(text, label);
    errors.push(...frontmatter.errors);
    if (!/^## \d*\.?\s*Contract catalog/m.test(text) && !/^## Contract catalog/m.test(text)) {
      errors.push(`${label}: missing Contract catalog`);
    }
    for (const match of text.matchAll(/\| `([A-Z]{2,}-[A-Z]+-\d{3})` \|/g)) {
      if (ids.has(match[1])) errors.push(`${label}: duplicate Contract ID ${match[1]}`);
      ids.add(match[1]);
    }
    if (!/^## \d*\.?\s*Revision log/m.test(text) && !/^## Revision log/m.test(text)) {
      errors.push(`${label}: missing Revision log`);
    } else if (
      frontmatter.values.document_version &&
      !new RegExp(
        `^\\| ${frontmatter.values.document_version.replaceAll('.', '\\.')} \\|`,
        'm',
      ).test(text)
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
  for (const row of registryText.matchAll(/^\| \[[^\]]+\]\(([^)]+)\) \| ([^|]+) \|/gm)) {
    const link = row[1];
    const version = row[2].match(/\bv(\d+\.\d+\.\d+)\b/);
    if (!version) continue;
    const target = link.startsWith('docs/')
      ? resolve(dirname(registryPath), '..', link)
      : resolve(dirname(registryPath), link);
    let targetText;
    try {
      targetText = readText(target);
    } catch {
      errors.push(`registry: missing ${link}`);
      continue;
    }
    const parsed = parseFrontmatter(targetText, link);
    errors.push(...parsed.errors);
    if (parsed.values.document_version !== version[1]) {
      errors.push(
        `registry: ${link} declares v${version[1]} but frontmatter is v${parsed.values.document_version ?? 'missing'}`,
      );
    }
    const expectedStatus = row[2].match(/(?:／)(Active|Proposed|Guideline)\b/)?.[1];
    if (expectedStatus && parsed.values.status !== expectedStatus) {
      errors.push(
        `registry: ${link} declares ${expectedStatus} but frontmatter is ${parsed.values.status ?? 'missing'}`,
      );
    }
  }
  return errors;
}

function parseTaskIndex(tasksText) {
  const tasks = new Map();
  for (const row of tasksText.matchAll(
    /^\| (TSK-[0-9]+(?:\.[0-9]+)?) \| ([^|]+) \| (done|ready|blocked|in_progress) \| ([^|]+) \|/gm,
  )) {
    tasks.set(row[1], {
      title: row[2].trim(),
      status: row[3],
      dependencies: row[4].trim() === '-' ? [] : row[4].trim().split(/\s*,\s*/),
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
  const errors = [];
  const tasks = parseTaskIndex(tasksText);
  if (tasks.size === 0) return ['tasks: empty Task index'];
  const inProgress = [...tasks].filter(([, task]) => task.status === 'in_progress');
  if (inProgress.length > 1) errors.push('tasks: more than one in_progress Task');

  for (const [id, task] of tasks) {
    for (const dependency of task.dependencies) {
      const parent = tasks.get(dependency);
      if (!parent) errors.push(`${id}: unknown dependency ${dependency}`);
      if ((task.status === 'ready' || task.status === 'in_progress') && parent?.status !== 'done') {
        errors.push(`${id}: ${task.status} requires done dependency ${dependency}`);
      }
    }

    const escaped = id.replace('.', '\\.');
    const section = tasksText.match(
      new RegExp(`^### ${escaped}:.*?\\n([\\s\\S]*?)(?=^### TSK-|^## 4\\.|\\Z)`, 'm'),
    )?.[1];
    if (!section) {
      errors.push(`${id}: missing Task section`);
      continue;
    }
    const sectionDependencies = section.match(/^Depends on:\s*(.+)$/m)?.[1].trim();
    const indexDependencies = task.dependencies.length === 0 ? '-' : task.dependencies.join(', ');
    if (sectionDependencies && sectionDependencies !== indexDependencies) {
      errors.push(
        `${id}: section dependency ${sectionDependencies} differs from index ${indexDependencies}`,
      );
    }
    if (task.status === 'done' && /Handoff:\s*未記録/.test(section)) {
      errors.push(`${id}: done without Handoff`);
    }
    if (task.status === 'done') continue;

    const matrix = section.match(/Contract closure matrix:\s*\n\n([\s\S]*?)(?=\nHandoff:)/)?.[1];
    if (!matrix) {
      errors.push(`${id}: missing Contract closure matrix`);
      continue;
    }
    const rows = [...matrix.matchAll(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
    if (rows.length === 0) errors.push(`${id}: empty Contract closure matrix`);
    for (const row of rows) {
      const [, contractId, disposition, command, artifact] = row;
      if (!contractIds.has(contractId)) errors.push(`${id}: unknown Contract ID ${contractId}`);
      const value = disposition.trim();
      if (!/^(Apply|N\/A: .+|Deferred: TSK-[0-9]+(?:\.[0-9]+)?)$/.test(value)) {
        errors.push(`${id}: invalid disposition for ${contractId}: ${value}`);
      }
      if (value === 'Apply' && (command.trim() === '-' || artifact.trim() === '-')) {
        errors.push(`${id}: Apply ${contractId} requires command and artifact`);
      }
      const deferred = value.match(/^Deferred: (TSK-[0-9]+(?:\.[0-9]+)?)$/)?.[1];
      if (deferred && !tasks.has(deferred)) errors.push(`${id}: unknown deferred Task ${deferred}`);
      if (deferred && tasks.has(deferred) && !dependsTransitively(tasks, deferred, id)) {
        errors.push(`${id}: ${contractId} deferred to non-descendant ${deferred}`);
      }
    }
  }
  return errors;
}

export function validateEvidenceRegistration(tasksText, evidenceIndexText, evidenceRoot) {
  const errors = [];
  const references = new Set(
    [...tasksText.matchAll(/docs\/evidence\/([^`<>\s)]+\.md)/g)].map((match) => match[1]),
  );
  for (const reference of references) {
    if (reference === 'README.md') continue;
    if (!existsSync(resolve(evidenceRoot, reference))) continue;
    if (!evidenceIndexText.includes(`](${reference})`)) {
      errors.push(`evidence: ${reference} is referenced by Tasks but missing from evidence index`);
    }
  }
  const declaredCount = Number(evidenceIndexText.match(/tracked report (\d+)件/)?.[1]);
  const indexedCount = [...evidenceIndexText.matchAll(/^\| \[[^\]]+\]\([^)]+\.md\) \|/gm)].length;
  if (Number.isFinite(declaredCount) && declaredCount !== indexedCount) {
    errors.push(`evidence: declares ${declaredCount} reports but indexes ${indexedCount}`);
  }
  return errors;
}

export function validateRepository(root) {
  const errors = [];
  const registryPath = resolve(root, 'docs/README.md');
  const tasksPath = resolve(root, 'docs/tasks/development-redesign-tasks.md');
  const evidencePath = resolve(root, 'docs/evidence/README.md');
  const contractPaths = [
    'docs/requirements/fgo-lab-requirements-v0.3.md',
    'docs/requirements/test-strategy-redesign.md',
    'docs/requirements/ranking-self-and-conditional-effects-requirements.md',
    'docs/requirements/development-execution-efficiency-requirements.md',
    'docs/guides/document-governance.md',
  ];
  const contracts = contractPaths.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]);
  const catalog = collectContractIds(contracts);
  errors.push(...catalog.errors);
  const registryText = readFileSync(registryPath, 'utf8');
  const tasksText = readFileSync(tasksPath, 'utf8');
  const evidenceText = readFileSync(evidencePath, 'utf8');
  errors.push(...parseFrontmatter(registryText, 'docs/README.md').errors);
  errors.push(...parseFrontmatter(tasksText, 'development-redesign-tasks.md').errors);
  errors.push(...validateRegistry(registryPath, registryText));
  errors.push(...validateTaskPlan(tasksText, catalog.ids));
  errors.push(
    ...validateEvidenceRegistration(tasksText, evidenceText, resolve(root, 'docs/evidence')),
  );
  return errors;
}
