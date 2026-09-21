#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { indexMemory, memoryRead, memorySearch, memoryStatus } from './store.mjs';
import { parseOptions } from './options.mjs';

const usage = `Uso: node mcp/memory/cli.mjs index|status|search|read [opzioni]
  --hub-root PATH       Root del hub; predefinita la root del codice del server
  --project-root PATH   Checkout del gioco, anche esterno al hub
  --scope all|hub|project  Predefinito all; read richiede hub o project
  --query TESTO         Ricerca testuale
  --path PERCORSO       Nota da leggere, relativa alla root dello scope
  --limit N             Da 1 a 50 risultati (predefinito 10)
L'indicizzazione è esplicita; status/search/read non scrivono file.`;

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return 0; }
  const [command, ...rest] = args;
  if (!['index', 'status', 'search', 'read'].includes(command)) throw new Error(usage);
  const options = parseOptions(rest, { cli: true });
  const allowed = {
    index: ['hubRoot', 'projectRoot', 'scope'], status: ['hubRoot', 'projectRoot', 'scope'],
    search: ['hubRoot', 'projectRoot', 'scope', 'query', 'limit'], read: ['hubRoot', 'projectRoot', 'scope', 'path'],
  }[command];
  if (Object.keys(options).some(key => !allowed.includes(key))) throw new Error('Opzione non applicabile al comando selezionato.');
  let output;
  if (command === 'index') {
    if (options.projectRoot && fs.realpathSync(options.projectRoot) === fs.realpathSync(options.hubRoot)) {
      throw new Error('Hub e progetto devono essere checkout distinti.');
    }
    const scope = options.scope ?? 'all';
    if (!['all', 'hub', 'project'].includes(scope)) throw new Error('Scope non valido.');
    if (scope === 'project' && !options.projectRoot) throw new Error('--project-root è richiesto per lo scope project.');
    const indexes = [];
    if (scope !== 'project') indexes.push(indexMemory({ root: options.hubRoot, scope: 'hub' }));
    if (scope !== 'hub' && options.projectRoot) indexes.push(indexMemory({ root: options.projectRoot, scope: 'project' }));
    output = { state: 'ready', indexes };
  } else if (command === 'status') output = memoryStatus(options);
  else if (command === 'search') output = memorySearch(options);
  else output = memoryRead(options);
  console.log(JSON.stringify(output, null, 2));
  return output.state === 'ready' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) {
    console.error(`games-memory: ${error.message}`);
    process.exitCode = 1;
  }
}
