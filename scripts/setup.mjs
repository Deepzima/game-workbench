#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const HUB_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const CLIENTS = ['vscode', 'claude', 'codex'];

export function assertNodeVersion(version = process.versions.node) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const parts = match?.slice(1).map(Number);
  const minimum = [22, 23, 2];
  if (!parts || parts.some(Number.isNaN)) throw new Error('Versione Node non riconosciuta. Usare mise install e mise run hub:setup.');
  const comparison = parts.findIndex((part, index) => part !== minimum[index]);
  if (comparison !== -1 && parts[comparison] < minimum[comparison]) {
    throw new Error('Richiesto Node >=22.23.2. Usare mise install e mise run hub:setup.');
  }
}

// This entry point must run before npm dependencies exist in a fresh clone.
export function parseSetupArgs(args) {
  const options = {}, seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error(`Opzione ripetuta: ${arg}.`);
    seen.add(arg);
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--skip-install') options.skipInstall = true;
    else if (arg === '--client' || arg === '--project-root') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Valore mancante per ${arg}.`);
      options[arg === '--client' ? 'client' : 'projectRoot'] = value;
    } else throw new Error('Opzione non riconosciuta. Usare --help.');
  }
  if (options.client !== undefined && !CLIENTS.includes(options.client)) throw new Error('Client non valido: usare vscode, claude o codex.');
  if (options.apply && !options.client) throw new Error('--apply richiede --client esplicito.');
  return options;
}

export function installDependencies({ hubRoot = HUB_ROOT, spawn = spawnSync, platform = process.platform, execPath = process.execPath, exists = fs.existsSync } = {}) {
  const args = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
  let command = 'npm';
  if (platform === 'win32') {
    // npm.cmd needs cmd.exe. Invoke npm's JS entry through Node instead, so
    // spaces and shell metacharacters never become executable shell text.
    const npmCli = path.join(path.dirname(execPath), 'node_modules/npm/bin/npm-cli.js');
    if (!exists(npmCli)) throw new Error('npm non trovato accanto a Node. Eseguire mise install e usare mise run hub:setup.');
    command = execPath;
    args.unshift(npmCli);
  }
  const result = spawn(command, args, { cwd: hubRoot, shell: false, windowsHide: true, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Installazione delle dipendenze non riuscita. Nessuna configurazione client applicata.');
}

export async function runSetup({ hubRoot = HUB_ROOT, client, projectRoot, apply = false, skipInstall = false, install = installDependencies, configure, nodeVersion = process.versions.node } = {}) {
  assertNodeVersion(nodeVersion);
  if (client !== undefined && !CLIENTS.includes(client)) throw new Error('Client non valido: usare vscode, claude o codex.');
  if (apply && !client) throw new Error('--apply richiede --client esplicito.');
  if (!skipInstall) install({ hubRoot });
  // Import only after npm ci has prepared the locked dependencies.
  const configureMemory = configure ?? (await import('./memory-adapters.mjs')).configureMemory;
  return configureMemory({ hubRoot, client, projectRoot, apply });
}

export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseSetupArgs(args);
    if (options.help) {
      console.log('Uso: node scripts/setup.mjs [--client vscode|claude|codex] [--project-root PATH] [--apply] [--skip-install]');
      console.log('--skip-install: usare solo se le dipendenze del lockfile sono già installate.');
      return 0;
    }
    const result = await runSetup(options);
    const { report } = await import('./memory-adapters.mjs');
    report(result);
    return 0;
  } catch (error) {
    const message = error.code === 'ERR_MODULE_NOT_FOUND' ? 'Dipendenze mancanti: eseguire mise run hub:setup senza --skip-install.' : error.message;
    console.error(`ERRORE: ${message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
