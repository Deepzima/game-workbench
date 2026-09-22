#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_BRIEF_BYTES = 8 * 1024 * 1024;
const MAX_EVENT_CHARS = 8 * 1024 * 1024;
const usage = `Uso: node scripts/claude.mjs --project-root /checkout/gioco --brief tasks/id/brief.md
  [--model NOME] [--max-turns 20] [--timeout-seconds 900] [--mcp-config REL.json]

Richiede Claude Code >= 2.1.259; verificato localmente con 2.1.263.
CLAUDE_BIN indica un eseguibile; altrimenti si usa claude dal PATH.
Prompt via stdin, print/stream-json/verbose, dontAsk e permission-prompts none.
MCP esclusi per default; --mcp-config seleziona solo il profilo esplicito nel progetto.
Il profilo MCP può stare in .games/local/ e non viene incluso nel prompt.
Chrome disabilitato. Nessun login, installazione, bypass o resume automatico.
Modello e regole native esistenti sono conservati salvo --model esplicito;
dontAsk nega operazioni che richiederebbero una nuova conferma, non concede tool.
Impostazioni, hook e plugin restano attivi: cwd e brief non sono una sandbox.
Brief massimo 8 MiB. Timeout/turni non sono limiti di spesa.
Exit: codice worker; 1 risultato mancante/errato, 2 input invalidi, 127 CLI assente,
124 timeout, 128+segnale interruzione. Un exit 0 non certifica il lavoro svolto.
`;

function checkRelative(value, kind) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
      path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`${kind}: percorso relativo al progetto richiesto, senza attraversamenti.`);
  }
  const forbidden = kind === 'Brief' ? ['.git', '.games', '.codex', '.claude'] : ['.git'];
  if (value.split('/').some(part => {
    const segment = part.toLowerCase();
    return forbidden.includes(segment) || segment === '.env' || segment.startsWith('.env.');
  })) throw new Error(`${kind}: percorso riservato non consentito.`);
}

export function parseArgs(argv) {
  const options = { timeoutSeconds: 900, maxTurns: 20 };
  const names = new Map([
    ['--project-root', 'projectRoot'], ['--brief', 'brief'], ['--model', 'model'],
    ['--timeout-seconds', 'timeoutSeconds'], ['--max-turns', 'maxTurns'], ['--mcp-config', 'mcpConfig'],
  ]);
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') return { help: true };
    const name = names.get(argv[i]);
    if (!name || seen.has(name)) throw new Error('Opzione sconosciuta o duplicata.');
    seen.add(name);
    const value = argv[++i];
    if (!value || value.startsWith('--') || value.includes('\0')) throw new Error(`Valore mancante o non valido: ${name}.`);
    options[name] = value;
  }
  if (!options.projectRoot || !path.isAbsolute(options.projectRoot)) throw new Error('--project-root deve essere un percorso assoluto esplicito.');
  checkRelative(options.brief, 'Brief');
  if (options.mcpConfig !== undefined) checkRelative(options.mcpConfig, 'Profilo MCP');
  if (options.model && (options.model.startsWith('-') || /\s/.test(options.model))) throw new Error('--model richiede un nome o alias non vuoto.');
  for (const [name, max] of [['timeoutSeconds', 86400], ['maxTurns', 1000]]) {
    options[name] = Number(options[name]);
    if (!Number.isInteger(options[name]) || options[name] < 1 || options[name] > max) throw new Error(`${name} deve essere un intero tra 1 e ${max}.`);
  }
  return options;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function inputFile(root, relative, kind) {
  checkRelative(relative, kind);
  const candidate = path.resolve(root, relative);
  if (!isWithin(root, candidate)) throw new Error(`${kind}: il file esce dal progetto.`);
  const filename = await fs.realpath(candidate);
  if (!isWithin(root, filename)) throw new Error(`${kind}: il symlink esce dal progetto.`);
  checkRelative(path.relative(root, filename).split(path.sep).join('/'), kind);
  const info = await fs.stat(filename);
  if (!info.isFile() || !info.size || info.size > MAX_BRIEF_BYTES) throw new Error(`${kind}: serve un file non vuoto di massimo 8 MiB.`);
  const content = await fs.readFile(filename, 'utf8');
  if (!content.trim() || Buffer.byteLength(content) > MAX_BRIEF_BYTES) throw new Error(`${kind}: serve un file non vuoto di massimo 8 MiB.`);
  return { filename, content };
}

export async function prepareInvocation(options, env = process.env) {
  const projectRoot = await fs.realpath(options.projectRoot);
  if (!(await fs.stat(projectRoot)).isDirectory()) throw new Error('--project-root non è una directory.');
  const brief = await inputFile(projectRoot, options.brief, 'Brief');
  let mcpConfig = '{"mcpServers":{}}';
  if (options.mcpConfig !== undefined) {
    const profile = await inputFile(projectRoot, options.mcpConfig, 'Profilo MCP');
    let parsed;
    try { parsed = JSON.parse(profile.content); } catch { throw new Error('Profilo MCP: JSON non valido; contenuto omesso.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.hasOwn(parsed, 'mcpServers') ||
        !parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
      throw new Error('Profilo MCP: richiesto un oggetto mcpServers; contenuto omesso.');
    }
    mcpConfig = profile.filename;
  }
  const executable = env.CLAUDE_BIN || 'claude';
  if (executable.includes('\0')) throw new Error('CLAUDE_BIN non valido.');
  const prompt = [
    `Esegui soltanto l'incarico nel brief ${JSON.stringify(path.relative(projectRoot, brief.filename))}, riportato sotto.`,
    'Leggi le istruzioni del progetto e gli input indicati; rispetta obiettivo, write_scope e criteri di verifica.',
    'Non ampliare i permessi, cambiare autenticazione/provider o avviare altri worker senza un incarico esplicito.',
    'Se il perimetro manca o un tool viene negato, restituisci il limite concreto; non riprovare tramite un bypass.',
    'Consegna modifiche, verifiche realmente eseguite e limiti. Non creare commit salvo richiesta nel brief.',
    '\n--- INIZIO BRIEF ---\n', brief.content, '\n--- FINE BRIEF ---\n',
  ].join('\n');
  // CLI docs: https://code.claude.com/docs/en/cli-reference
  // max-turns is supported but hidden from the default help in Claude Code 2.1.263.
  const args = ['--print', '--input-format', 'text', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--no-chrome',
    '--max-turns', String(options.maxTurns), '--strict-mcp-config', '--mcp-config', mcpConfig];
  if (options.model) args.push('--model', options.model);
  return { executable, args, cwd: projectRoot, prompt, timeoutMs: options.timeoutSeconds * 1000 };
}

function resultTracker() {
  let pending = '', dropping = false, malformed = false, seen = false, failed = false;
  const line = text => {
    if (!text.trim()) return;
    let event;
    try { event = JSON.parse(text); } catch { malformed = true; return; }
    if (event?.type === 'result') {
      seen = true;
      if (event.is_error !== false || event.subtype !== 'success') failed = true;
    }
  };
  return {
    push(chunk) {
      for (const [index, part] of chunk.split('\n').entries()) {
        if (index) {
          if (!dropping) line(pending);
          pending = ''; dropping = false;
        }
        if (!dropping) {
          if (pending.length + part.length > MAX_EVENT_CHARS) { malformed = true; dropping = true; pending = ''; }
          else pending += part;
        }
      }
    },
    finish() {
      if (!dropping) line(pending);
      if (failed) return 'Il runtime ha restituito un result di errore.';
      if (malformed) return 'Stream JSON non valido o evento oltre il limite di 8 MiB di caratteri.';
      if (!seen) return 'Nessun result finale ricevuto: esito non verificabile.';
      return null;
    },
  };
}

export function runClaude(invocation, { env = process.env, killGraceMs = 5000 } = {}) {
  return new Promise(resolve => {
    const grouped = process.platform !== 'win32';
    const child = spawn(invocation.executable, invocation.args, {
      cwd: invocation.cwd, env, shell: false, detached: grouped, stdio: ['pipe', 'pipe', 'inherit'],
    });
    const tracker = resultTracker();
    let stopped = null, inputError = false, timer, escalation;
    const signal = name => {
      try {
        if (grouped && child.pid) process.kill(-child.pid, name);
        else child.kill(name);
      } catch (error) {
        if (error.code !== 'ESRCH') process.stderr.write(`Claude: inoltro ${name} fallito (${error.code}).\n`);
      }
    };
    const stop = reason => {
      if (stopped) { signal('SIGKILL'); return; }
      stopped = reason;
      process.stderr.write(`Claude: ${reason}; arresto del worker prima di un eventuale subentro.\n`);
      signal(reason === 'timeout' ? 'SIGTERM' : reason);
      escalation = setTimeout(() => signal('SIGKILL'), killGraceMs);
    };
    const onInterrupt = () => stop('SIGINT'), onTerminate = () => stop('SIGTERM');
    process.on('SIGINT', onInterrupt); process.on('SIGTERM', onTerminate);
    const cleanup = () => {
      clearTimeout(timer); clearTimeout(escalation);
      process.off('SIGINT', onInterrupt); process.off('SIGTERM', onTerminate);
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => tracker.push(chunk));
    child.stdout.pipe(process.stdout, { end: false });
    child.stdin.on('error', () => { inputError = true; });
    child.once('spawn', () => {
      timer = setTimeout(() => stop('timeout'), invocation.timeoutMs);
      child.stdin.end(invocation.prompt);
    });
    child.once('error', error => {
      cleanup();
      process.stderr.write(`Claude non avviato: ${error.code || 'errore del processo'}. Controllare PATH o CLAUDE_BIN.\n`);
      resolve(error.code === 'ENOENT' ? 127 : 1);
    });
    child.once('close', (code, exitSignal) => {
      if (stopped && grouped) signal('SIGKILL');
      cleanup();
      if (stopped === 'timeout') return resolve(124);
      if (stopped || exitSignal) return resolve(128 + (os.constants.signals[stopped || exitSignal] || 1));
      if (code !== 0) return resolve(code ?? 1);
      const problem = inputError ? 'Invio del brief via stdin incompleto.' : tracker.finish();
      if (problem) process.stderr.write(`Claude: ${problem}\n`);
      resolve(problem ? 1 : 0);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) process.stdout.write(usage);
    else process.exitCode = await runClaude(await prepareInvocation(options));
  } catch (error) {
    process.stderr.write(`Claude: ${error.message}\n`);
    process.exitCode = 2;
  }
}
