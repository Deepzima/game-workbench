#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const usage = `Uso: node scripts/opencode.mjs --project-root /checkout/gioco --brief tasks/id/brief.md
  [--model provider/model] [--timeout-seconds 900]

Avvia un solo incarico OpenCode; non installa né configura provider.
OPENCODE_BIN può indicare il binario; altrimenti viene cercato opencode nel PATH.
La directory di lavoro e il brief non costituiscono una sandbox.
`;

function checkBriefPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
      path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('--brief richiede un percorso relativo al progetto, senza attraversamenti.');
  }
  if (value.split('/').some(part => {
    const segment = part.toLowerCase();
    return ['.git', '.games', '.codex', '.claude', '.env'].includes(segment) || segment.startsWith('.env.');
  })) throw new Error('Brief riservato: configurazioni locali e credenziali non possono essere allegate.');
}

export function parseArgs(argv) {
  const options = { timeoutSeconds: 900 };
  const names = new Map([
    ['--project-root', 'projectRoot'], ['--brief', 'brief'],
    ['--model', 'model'], ['--timeout-seconds', 'timeoutSeconds'],
  ]);
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') return { help: true };
    const name = names.get(argv[i]);
    if (!name || seen.has(name)) throw new Error(`Opzione sconosciuta o duplicata: ${argv[i]}`);
    seen.add(name);
    const value = argv[++i];
    if (!value || value.startsWith('--') || value.includes('\0')) throw new Error(`Valore mancante o non valido: ${name}`);
    options[name] = value;
  }
  if (!options.projectRoot || !path.isAbsolute(options.projectRoot)) throw new Error('--project-root deve essere un percorso assoluto esplicito.');
  checkBriefPath(options.brief);
  if (options.model && (options.model.startsWith('-') || !/^[^\s/]+\/[^\s]+$/.test(options.model))) throw new Error('--model richiede provider/model.');
  options.timeoutSeconds = Number(options.timeoutSeconds);
  if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 1 || options.timeoutSeconds > 86400) {
    throw new Error('--timeout-seconds deve essere un intero tra 1 e 86400.');
  }
  return options;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function prepareInvocation(options, env = process.env) {
  checkBriefPath(options.brief);
  const projectRoot = await fs.realpath(options.projectRoot);
  if (!(await fs.stat(projectRoot)).isDirectory()) throw new Error('--project-root non è una directory.');
  const candidate = path.resolve(projectRoot, options.brief);
  if (!isWithin(projectRoot, candidate)) throw new Error('Il brief deve restare dentro il progetto.');
  const brief = await fs.realpath(candidate);
  if (!isWithin(projectRoot, brief)) throw new Error('Il symlink del brief esce dal progetto.');
  checkBriefPath(path.relative(projectRoot, brief).split(path.sep).join('/'));
  if (!(await fs.stat(brief)).isFile() || !(await fs.readFile(brief, 'utf8')).trim()) throw new Error('Il brief deve essere un file non vuoto.');
  const executable = env.OPENCODE_BIN || 'opencode';
  if (executable.includes('\0')) throw new Error('OPENCODE_BIN non valido.');
  const prompt = [
    `Esegui l'incarico nel brief allegato ${JSON.stringify(path.relative(projectRoot, brief))}.`,
    'Leggi prima le istruzioni del progetto e gli input indicati; rispetta obiettivo, write_scope e criteri di verifica.',
    'Non ampliare i permessi, non modificare provider o autenticazione e non avviare altri worker senza incarico esplicito.',
    'Se il brief non definisce il perimetro o una capacità manca, restituisci il blocco invece di inventare risultati.',
    'Consegna modifiche, verifiche realmente eseguite, limiti e riferimenti alle evidenze. Non creare commit salvo richiesta nel brief.',
  ].join('\n');
  const args = ['run', prompt, '--format', 'json', '--dir', projectRoot];
  if (options.model) args.push('--model', options.model);
  // --file is an array option. Keep it last so the prompt cannot become an attachment.
  args.push('--file', brief);
  return { executable, args, cwd: projectRoot, timeoutMs: options.timeoutSeconds * 1000 };
}

export function runOpenCode(invocation, { env = process.env, killGraceMs = 5000 } = {}) {
  return new Promise(resolve => {
    const grouped = process.platform !== 'win32';
    const child = spawn(invocation.executable, invocation.args, {
      cwd: invocation.cwd, env, shell: false, detached: grouped,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    let stopped = null, timer, escalation;
    const signal = name => {
      try {
        if (grouped && child.pid) process.kill(-child.pid, name);
        else child.kill(name);
      } catch (error) {
        if (error.code !== 'ESRCH') process.stderr.write(`OpenCode: inoltro ${name} fallito (${error.code}).\n`);
      }
    };
    const stop = reason => {
      if (stopped) { signal('SIGKILL'); return; }
      stopped = reason;
      process.stderr.write(`OpenCode: ${reason}; arresto del worker prima di un eventuale subentro.\n`);
      signal(reason === 'timeout' ? 'SIGTERM' : reason);
      escalation = setTimeout(() => signal('SIGKILL'), killGraceMs);
    };
    const onInterrupt = () => stop('SIGINT'), onTerminate = () => stop('SIGTERM');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    const cleanup = () => {
      clearTimeout(timer); clearTimeout(escalation);
      process.off('SIGINT', onInterrupt); process.off('SIGTERM', onTerminate);
    };
    child.once('spawn', () => { timer = setTimeout(() => stop('timeout'), invocation.timeoutMs); });
    child.once('error', error => {
      cleanup();
      process.stderr.write(`OpenCode non avviato: ${error.code || error.message}. Controllare PATH o OPENCODE_BIN.\n`);
      resolve(error.code === 'ENOENT' ? 127 : 1);
    });
    child.once('close', (code, exitSignal) => {
      // A stopped leader may leave children alive in its process group.
      if (stopped && grouped) signal('SIGKILL');
      cleanup();
      if (stopped === 'timeout') resolve(124);
      else if (stopped || exitSignal) resolve(128 + (os.constants.signals[stopped || exitSignal] || 1));
      else resolve(code ?? 1);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) process.stdout.write(usage);
    else process.exitCode = await runOpenCode(await prepareInvocation(options));
  } catch (error) {
    process.stderr.write(`OpenCode: ${error.message}\n`);
    process.exitCode = 2;
  }
}
