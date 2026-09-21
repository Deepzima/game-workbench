#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const HUB_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_SNAPSHOT = 'docs/verification/coordinator-reviewer/snapshot.json';

const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

function validatePath(filename) {
  if (typeof filename !== 'string' || !filename || filename.includes('\\') || filename.includes('\0') ||
      path.isAbsolute(filename) || path.win32.isAbsolute(filename) || filename.split('/').includes('..')) {
    return 'Il riferimento deve essere un percorso relativo senza attraversamenti.';
  }
  return null;
}

function fileError(error) {
  if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return 'File non trovato.';
  if (error.code === 'EACCES' || error.code === 'EPERM') return 'File non accessibile.';
  if (error.code === 'ELOOP') return 'Collegamento simbolico non risolvibile.';
  return 'Impossibile leggere il file.';
}

export async function checkSnapshot({ root = HUB_ROOT, snapshot = DEFAULT_SNAPSHOT } = {}) {
  const errors = [];
  const mismatches = [];
  const counts = { checked: 0, matched: 0, mismatched: 0, errors: 0 };
  const result = () => {
    counts.errors = errors.length;
    return { ok: errors.length === 0 && mismatches.length === 0, counts, errors, mismatches };
  };

  let base;
  try {
    base = await fs.realpath(root);
    if (!(await fs.stat(base)).isDirectory()) throw new Error();
  } catch {
    errors.push('Root: directory non accessibile.');
    return result();
  }

  let text;
  try {
    if (typeof snapshot !== 'string' || !snapshot) throw new Error();
    text = await fs.readFile(path.resolve(base, snapshot), 'utf8');
  } catch (error) {
    errors.push(`Snapshot: ${fileError(error)}`);
    return result();
  }

  let manifest;
  try { manifest = JSON.parse(text); } catch {
    errors.push('Snapshot: JSON non valido.');
    return result();
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.algorithm !== 'sha256') {
    errors.push('Snapshot: algorithm deve essere sha256.');
  }
  if (!Array.isArray(manifest?.files) || manifest.files.length === 0) {
    errors.push('Snapshot: files deve essere un array non vuoto.');
  }
  if (errors.length) return result();

  const seen = new Set();
  for (const [index, entry] of manifest.files.entries()) {
    const label = `Snapshot files[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label}: voce non valida.`);
      continue;
    }
    const invalidPath = validatePath(entry.path);
    if (invalidPath) errors.push(`${label}: ${invalidPath}`);
    else {
      const normalized = path.posix.normalize(entry.path);
      if (seen.has(normalized)) errors.push(`${label}: percorso duplicato ${JSON.stringify(entry.path)}.`);
      seen.add(normalized);
    }
    if (typeof entry.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(entry.sha256)) {
      errors.push(`${label}: sha256 deve contenere 64 cifre esadecimali.`);
    }
  }
  // Validate every entry before opening any listed file.
  if (errors.length) return result();

  for (const entry of manifest.files) {
    const label = JSON.stringify(entry.path);
    let target;
    try { target = await fs.realpath(path.join(base, entry.path)); } catch (error) {
      errors.push(`${label}: ${fileError(error)}`);
      continue;
    }
    if (!inside(base, target)) {
      errors.push(`${label}: il riferimento esce dal hub tramite un collegamento simbolico.`);
      continue;
    }
    try {
      if (!(await fs.stat(target)).isFile()) {
        errors.push(`${label}: il riferimento non è un file.`);
        continue;
      }
      const actual = createHash('sha256').update(await fs.readFile(target)).digest('hex');
      counts.checked++;
      if (actual === entry.sha256.toLowerCase()) counts.matched++;
      else {
        counts.mismatched++;
        mismatches.push(entry.path);
      }
    } catch (error) {
      errors.push(`${label}: ${fileError(error)}`);
    }
  }
  return result();
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  const usage = 'Uso: node scripts/check-snapshot.mjs [FILE] [--root ROOT]';
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return 0;
  }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--root' && !options.root && args[index + 1] && !args[index + 1].startsWith('-')) {
      options.root = args[++index];
    } else if (!argument.startsWith('-') && !options.snapshot) options.snapshot = argument;
    else {
      console.error(usage);
      return 1;
    }
  }
  const result = await checkSnapshot(options);
  for (const filename of result.mismatches) console.error(`DIFF: ${JSON.stringify(filename)}: SHA-256 diverso dallo snapshot.`);
  for (const error of result.errors) console.error(`ERRORE: ${error}`);
  console.log(`${result.ok ? 'OK' : 'FAIL'}: checked=${result.counts.checked} matched=${result.counts.matched} mismatched=${result.counts.mismatched} errors=${result.counts.errors}`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main().catch(() => {
    console.error('ERRORE: impossibile completare la verifica dello snapshot.');
    return 1;
  });
}
