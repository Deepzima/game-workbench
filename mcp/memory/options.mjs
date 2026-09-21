import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HUB_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function parseOptions(args, { cli = false } = {}) {
  const options = { hubRoot: HUB_ROOT };
  const flags = new Map([
    ['--hub-root', 'hubRoot'], ['--project-root', 'projectRoot'],
    ...(cli ? [['--scope', 'scope'], ['--query', 'query'], ['--path', 'path'], ['--limit', 'limit']] : []),
  ]);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const name = flags.get(args[i]);
    if (!name || seen.has(name) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('Argomento sconosciuto, duplicato o privo di valore. Usare --help.');
    }
    seen.add(name);
    options[name] = args[++i];
  }
  for (const name of ['hubRoot', 'projectRoot']) {
    if (options[name]) options[name] = path.resolve(options[name]);
  }
  if (options.limit !== undefined) {
    if (!/^\d+$/.test(options.limit)) throw new Error('--limit deve essere un intero fra 1 e 50.');
    options.limit = Number(options.limit);
    if (options.limit < 1 || options.limit > 50) throw new Error('--limit deve essere un intero fra 1 e 50.');
  }
  return options;
}
