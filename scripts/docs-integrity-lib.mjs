import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { parsers as markdown } from 'prettier/plugins/markdown';
import { parsers as html } from 'prettier/plugins/html';

const requiredDocuments = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/README.md',
  'docs/usage.md',
  'docs/calculation.md',
  'docs/architecture.md',
  'docs/development.md',
  'docs/testing.md',
  'docs/licenses/data-sources.md',
];
const internalPath = (path) =>
  /^(?:\.local-docs|\.codex|\.serena)(?:\/|$)|^docs\/(?:tasks|evidence|requirements|archive|adr)(?:\/|$)/.test(
    path,
  );

/** Inspect the public Git tree. Private notes and agent settings are never inputs. */
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
    if (internalPath(path)) {
      errors.push(`${path}: internal material in public Git tree; not read`);
      continue;
    }
    if (protectedEnvironmentPath(path)) {
      errors.push(`${path}: protected environment path in Git tree; not read`);
      continue;
    }
    if (!/\.md$/i.test(path)) continue;
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
          errors.push('CLAUDE.md: invalid alias; expected tracked symlink to AGENTS.md');
      } catch (cause) {
        errors.push(`CLAUDE.md: invalid alias: ${cause.message}`);
      }
      continue;
    }
    try {
      const absolute = resolve(root, path);
      if (!['100644', '100755'].includes(entry.mode) || !lstatSync(absolute).isFile())
        throw new Error('expected tracked regular Markdown file');
      const real = relative(realpathSync(root), realpathSync(absolute)).split(sep).join('/');
      if (
        real === '..' ||
        real.startsWith('../') ||
        protectedEnvironmentPath(real) ||
        internalPath(real)
      )
        throw new Error('Markdown resolves outside public tree');
      const text = readFileSync(absolute, 'utf8');
      const parsed = analyzeMarkdown(text, path);
      errors.push(...parsed.errors);
      if (/\bTSK-\d/i.test(text))
        errors.push(`${path}: internal task identifier in public documentation`);
      if (/\/(?:home|Users)\//.test(text))
        errors.push(`${path}: personal filesystem path in public documentation`);
      documents.set(path, { text, ...parsed });
    } catch (cause) {
      errors.push(`${path}: ${cause.message}`);
    }
  }
  for (const path of requiredDocuments)
    if (!entries.has(path) || (path !== 'CLAUDE.md' && !documents.has(path)))
      errors.push(`${path}: missing required public document`);
  const edges = new Map();
  let referenceCount = 0;
  for (const [path, document] of documents) {
    const targets = [];
    for (const reference of document.references) {
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
    for (const target of edges.get(path) ?? []) if (/\.md$/i.test(target)) pending.push(target);
  }
  for (const path of documents.keys())
    if (!registered.has(path))
      errors.push(`${path}: unregistered; unreachable from docs/README.md`);
  return {
    errors: [...new Set(errors)],
    counts: {
      markdown: [...entries.keys()].filter((path) => /\.md$/i.test(path)).length,
      references: referenceCount,
      registered: registered.size,
    },
  };
}

export function validateRepository(root) {
  return inspectRepository(root).errors;
}

function nodeText(node) {
  return !node || node.type === 'html'
    ? ''
    : node.type === 'image'
      ? node.alt
      : (node.value ?? (node.children ?? []).map(nodeText).join(''));
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
    if (internalPath(target)) throw new Error('reference to internal material');
    if (!entries.has(target)) throw new Error(`untracked target ${target}`);
    const real = relative(realpathSync(root), realpathSync(absolute));
    if (real === '..' || real.startsWith(`..${sep}`))
      throw new Error('target resolves outside repository');
    if (protectedEnvironmentPath(real.split(sep).join('/')))
      throw new Error('target resolves to protected environment path');
    if (internalPath(real.split(sep).join('/')))
      throw new Error('target resolves to internal material');
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
