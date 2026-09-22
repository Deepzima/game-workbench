import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fail = message => { throw new Error(message); };
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function localFile(root, relative) {
  if (!relative || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || /[\\\0]/.test(relative)) fail('Percorso locale relativo richiesto.');
  const lexical = path.resolve(root, relative);
  if (!inside(root, lexical)) fail('Il link locale esce dal hub.');
  const actual = await fs.realpath(lexical);
  if (!inside(root, actual)) fail('Il link locale esce dal hub tramite symlink.');
  if (!(await fs.stat(actual)).isFile()) fail('Il link locale deve indicare un file.');
  return actual;
}

// Deliberately limited Markdown: inline [label](target), outside comments,
// fenced code and inline code. Reference/HTML links are not supported.
function visibleMarkdown(body) {
  let fence = null;
  const lines = body.replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/).map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return '';
    }
    if (marker) { fence = marker[1]; return ''; }
    return /^(?: {4}|\t)/.test(line) ? '' : line;
  });
  return lines.join('\n').replace(/(`+)[\s\S]*?\1/g, '');
}

async function adapterLinks(root, entry, body) {
  const markdown = visibleMarkdown(body);
  if (/!?\[[^\]\n]+\]\s*\[[^\]\n]*\]|^ {0,3}\[[^\]\n]+\]:|<\s*(?:a|img)\b/im.test(markdown)) fail('Usare soltanto link Markdown inline [testo](destinazione), senza link reference o HTML.');
  const links = new Set();
  const inline = /(?<!\\)(!?)\[[^\]\n]+\]\(([^\n)]*)\)/g;
  if (/(?<!\\)\[[^\]\n]+\]\(/.test(markdown.replace(inline, ''))) fail('Link inline non chiuso o non supportato.');
  for (const match of markdown.matchAll(inline)) {
    const target = match[2].trim();
    if (!target || /[\s()<>\\]/.test(target)) fail('Destinazione inline non supportata: usare un percorso senza spazi, titoli o parentesi.');
    if (/^https?:\/\//i.test(target)) continue; // No network access or remote-link validation.
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith('//')) fail('Sono ammessi soltanto link locali relativi o HTTP(S).');
    const fragment = target.indexOf('#');
    let relative;
    try { relative = decodeURIComponent(fragment < 0 ? target : target.slice(0, fragment)); }
    catch { fail('Codifica del link locale non valida.'); }
    if (!relative) continue; // Same-document fragment; anchor contents are not checked.
    if (relative.includes('?') || /[\x00-\x1f\x7f]/.test(relative) || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.includes('\\')) fail('Link locale non relativo o non supportato.');
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.file), relative));
    await localFile(root, resolved);
    if (!match[1]) links.add(resolved);
  }
  return links;
}

export async function validateAgentAdapters({ root, adapters = [], roles } = {}) {
  if (!Array.isArray(adapters) || !Array.isArray(roles)) fail('Catalogo adattatori o ruoli non valido.');
  const base = await fs.realpath(root), ids = new Set(), mappings = new Set();
  for (const entry of adapters) {
    if (!entry || typeof entry.id !== 'string' || entry.id.length > 64 || !ID.test(entry.id) || entry.client !== 'vscode') fail('Adattatore non valido: id e client vscode richiesti.');
    if (ids.has(entry.id)) fail(`Adattatore ${entry.id}: identificatore duplicato.`);
    ids.add(entry.id);
    const mapping = `${entry.client}:${entry.role}`;
    if (mappings.has(mapping)) fail(`Adattatore ${entry.id}: mapping client/ruolo ambiguo.`);
    mappings.add(mapping);
    const canonical = roles.filter(role => role.id === entry.role);
    if (canonical.length !== 1) fail(`Adattatore ${entry.id}: ruolo canonico assente o ambiguo.`);
    if (entry.file !== `.github/agents/${entry.id}.agent.md`) fail(`Adattatore ${entry.id}: file richiesto .github/agents/<id>.agent.md.`);
    const text = (await fs.readFile(await localFile(base, entry.file), 'utf8')).replace(/^\uFEFF/, '');
    const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!header || /^\s*---(?:\r?\n|$)/.test(header[2])) fail(`Adattatore ${entry.id}: richiesto un solo frontmatter YAML iniziale.`);
    const document = parseDocument(header[1], { uniqueKeys: true });
    if (document.errors.length) fail(`Adattatore ${entry.id}: YAML non valido o chiavi duplicate.`);
    const metadata = document.toJS({ maxAliasCount: 100 });
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.name !== entry.id ||
        typeof metadata.description !== 'string' || !metadata.description.trim()) fail(`Adattatore ${entry.id}: name deve corrispondere all’id e description non deve essere vuota.`);
    if (!header[2].trim()) fail(`Adattatore ${entry.id}: corpo Markdown vuoto.`);
    const links = await adapterLinks(base, entry, header[2]);
    await localFile(base, canonical[0].file);
    if (!links.has(canonical[0].file)) fail(`Adattatore ${entry.id}: manca il link inline al ruolo canonico ${entry.role}.`);
  }
  return adapters;
}
