import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { parseArgs, prepareInvocation, runClaude } from '../scripts/claude.mjs';

const launcher = fileURLToPath(new URL('../scripts/claude.mjs', import.meta.url));
const success = { type: 'result', subtype: 'success', is_error: false, session_id: 'synthetic-test-session', result: 'Fixture riuscita.' };
const emitSuccess = `console.log(${JSON.stringify(JSON.stringify(success))});`;
const posix = { skip: process.platform === 'win32' };

async function fixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'games claude ')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const project = path.join(base, 'project with spaces'), binDir = path.join(base, 'fake bin');
  await fs.mkdir(project); await fs.mkdir(binDir);
  const put = async (relative, content) => {
    const filename = path.join(project, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, content);
    return filename;
  };
  const brief = 'tasks/brief $(touch injected).md';
  const content = '# Incarico sintetico\nwrite_scope: []\n`echo nope`; $(touch injected); ü 日本語\n';
  await put(brief, content);
  const fake = async (source, { readStdin = true } = {}) => {
    const executable = path.join(binDir, 'claude');
    const body = readStdin
      ? `let prompt = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { prompt += chunk; }); process.stdin.on('end', () => { ${source} });`
      : source;
    await fs.writeFile(executable, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
    return executable;
  };
  const args = ['--project-root', project, '--brief', brief];
  const run = (executable, extra = [], env = {}) => spawnSync(process.execPath, [launcher, ...args, ...extra], {
    env: { ...process.env, CLAUDE_BIN: executable, ...env }, encoding: 'utf8', timeout: 10000,
  });
  return { base, project, binDir, brief, content, put, fake, args, run };
}

test('argomenti delimitati: root esplicita, percorsi portabili, turni e timeout; niente bypass o resume', () => {
  assert.deepEqual(parseArgs(['--help']), { help: true });
  const valid = ['--project-root', '/tmp/project', '--brief', 'tasks/brief.md'];
  for (const args of [[], ['--project-root', 'relative', '--brief', 'brief.md'],
    [...valid, '--brief', 'duplicate.md'], [...valid, '--max-turns', '0'], [...valid, '--max-turns', '1.5'],
    [...valid, '--max-turns', '1001'], [...valid, '--timeout-seconds', '0'], [...valid, '--timeout-seconds', '86401'],
    [...valid, '--model', '-bad'], [...valid, '--model', 'two words'], [...valid, '--bare'],
    [...valid, '--dangerously-skip-permissions'], [...valid, '--resume', 'session'], [...valid, '--chrome'],
    [...valid, '--mcp-config', '/tmp/profile.json'], [...valid, '--mcp-config', '../profile.json'],
  ]) assert.throws(() => parseArgs(args));
  for (const brief of ['/tmp/brief.md', '../brief.md', 'tasks/../brief.md', './brief.md', 'C:\\file.md', 'C:file.md', '.env', '.env.local', '.ENV.EXAMPLE', '.games/brief.md', '.git/config', '.claude/settings.json', '.codex/config.toml']) {
    assert.throws(() => parseArgs(['--project-root', '/tmp/project', '--brief', brief]));
  }
});

test('brief: file non vuoto, checkout canonico e nessun symlink esterno o riservato', async t => {
  const f = await fixture(t);
  const prepare = async brief => prepareInvocation(parseArgs(['--project-root', f.project, '--brief', brief]));
  await assert.rejects(prepare('missing.md'), /ENOENT/);
  await f.put('empty.md', '\n '); await assert.rejects(prepare('empty.md'), /non vuoto/);
  await assert.rejects(prepare('tasks'), /file non vuoto/);
  const outside = path.join(f.base, 'outside.md'); await fs.writeFile(outside, 'Fixture outside.');
  await fs.symlink(outside, path.join(f.project, 'alias.md')); await assert.rejects(prepare('alias.md'), /symlink/);
  await f.put('.games/hidden.md', 'Synthetic private fixture.');
  await fs.symlink(path.join(f.project, '.games/hidden.md'), path.join(f.project, 'internal-alias.md'));
  await assert.rejects(prepare('internal-alias.md'), /riservato/);
  await fs.symlink(f.project, path.join(f.base, 'checkout-alias'));
  const invocation = await prepareInvocation(parseArgs(['--project-root', path.join(f.base, 'checkout-alias'), '--brief', f.brief]));
  assert.equal(invocation.cwd, f.project);
  await f.put('too-large.md', Buffer.alloc(8 * 1024 * 1024 + 1, 'x'));
  await assert.rejects(prepare('too-large.md'), /8 MiB/);
});

test('MCP è escluso per default; un profilo locale esplicito resta fuori dal prompt e dai diagnostici', async t => {
  const f = await fixture(t);
  const initial = await prepareInvocation(parseArgs(f.args));
  assert.equal(initial.args[initial.args.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
  assert.ok(initial.args.includes('--strict-mcp-config'));
  const config = '.games/local/games-memory.claude.json';
  await f.put(config, JSON.stringify({ mcpServers: { memory: { command: 'test-fixture-only', env: { MARKER: 'synthetic-config-not-prompt' } } } }));
  const explicit = await prepareInvocation(parseArgs([...f.args, '--mcp-config', config]));
  assert.equal(explicit.args[explicit.args.indexOf('--mcp-config') + 1], path.join(f.project, config));
  assert.equal(explicit.prompt.includes('synthetic-config-not-prompt'), false);
  assert.equal(explicit.args.join('\n').includes('synthetic-config-not-prompt'), false);
  for (const content of ['{ "fixture-sensitive-marker":', '[]', '{"mcpServers":[]}']) {
    await f.put(config, content);
    await assert.rejects(prepareInvocation(parseArgs([...f.args, '--mcp-config', config])), error =>
      /Profilo MCP/.test(error.message) && !error.message.includes('fixture-sensitive-marker'));
  }
  await fs.writeFile(path.join(f.base, 'outside.json'), '{"mcpServers":{}}');
  await fs.symlink(path.join(f.base, 'outside.json'), path.join(f.project, 'mcp-alias.json'));
  await assert.rejects(prepareInvocation(parseArgs([...f.args, '--mcp-config', 'mcp-alias.json'])), /symlink/);
});

test('argv/stdin separati senza shell, modello solo esplicito, dontAsk e integrazione Chrome disabilitata', posix, async t => {
  const f = await fixture(t);
  const executable = await f.fake(`console.log(JSON.stringify({ type: 'system', subtype: 'init', argv: process.argv.slice(2), cwd: process.cwd(), prompt })); ${emitSuccess}`);
  const result = f.run(executable, ['--model', 'fixture-model-$()', '--max-turns', '6']);
  assert.equal(result.status, 0, result.stderr);
  const [init, final] = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(init.cwd, f.project);
  assert.ok(init.prompt.includes(f.content));
  assert.deepEqual(init.argv, ['--print', '--input-format', 'text', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--no-chrome', '--max-turns', '6',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--model', 'fixture-model-$()']);
  assert.equal(init.argv.some(arg => arg.includes(f.content)), false);
  assert.equal(final.session_id, 'synthetic-test-session');
  await assert.rejects(fs.access(path.join(f.project, 'injected')), /ENOENT/);
});

test('risoluzione PATH e modello configurato; binario mancante con codice 127', posix, async t => {
  const f = await fixture(t);
  await f.fake(`console.log(JSON.stringify({type:'system',argv:process.argv.slice(2)})); ${emitSuccess}`);
  const env = { ...process.env, PATH: `${f.binDir}${path.delimiter}${process.env.PATH}` }; delete env.CLAUDE_BIN;
  const result = spawnSync(process.execPath, [launcher, ...f.args], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const argv = JSON.parse(result.stdout.split('\n')[0]).argv;
  assert.equal(argv.includes('--model'), false);
  assert.equal(argv[argv.indexOf('--max-turns') + 1], '20');
  const missing = f.run(path.join(f.base, 'absent'));
  assert.equal(missing.status, 127); assert.match(missing.stderr, /ENOENT/);
});

test('stream JSON frammentato UTF-8 e ultima riga senza newline conservano il risultato', posix, async t => {
  const f = await fixture(t);
  const event = JSON.stringify({ ...success, result: 'ü 日本語' });
  const executable = await f.fake(`const bytes=Buffer.from(${JSON.stringify(event)}); for(let i=0;i<bytes.length;i+=3) process.stdout.write(bytes.subarray(i,i+3));`);
  const result = f.run(executable);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ...success, result: 'ü 日本語' });
});

test('errori result, limite turni, stream incompleto o invalido non diventano successo con exit zero', posix, async t => {
  const f = await fixture(t);
  const cases = [
    { type: 'result', subtype: 'success', is_error: true },
    { type: 'result', subtype: 'error_max_turns', is_error: true },
    { type: 'result', subtype: 'error_during_execution', is_error: true },
    { type: 'result', subtype: 'unknown', is_error: false },
    { type: 'system', subtype: 'init', session_id: 'synthetic-only' },
  ];
  for (const event of cases) {
    const executable = await f.fake(`console.log(${JSON.stringify(JSON.stringify(event))});`);
    const result = f.run(executable);
    assert.equal(result.status, 1, JSON.stringify(event));
  }
  for (const source of ["console.log('not JSON');", '',
    `console.log('{broken'); ${emitSuccess}`,
    `console.log(JSON.stringify({type:'result',subtype:'error_max_turns',is_error:true})); ${emitSuccess}`,
  ]) assert.equal(f.run(await f.fake(source)).status, 1);
  const nonzero = f.run(await f.fake(`${emitSuccess} process.exitCode=7;`));
  assert.equal(nonzero.status, 7);
});

test('stdin chiuso presto dal worker non causa crash EPIPE o falso successo', posix, async t => {
  const f = await fixture(t);
  await f.put(f.brief, 'x'.repeat(2 * 1024 * 1024));
  const executable = await f.fake(`${emitSuccess} process.exit(0);`, { readStdin: false });
  const result = f.run(executable);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /stdin incompleto/);
  assert.doesNotMatch(result.stderr, /Unhandled/);
});

test('timeout termina il worker e restituisce 124', { ...posix, timeout: 10000 }, async t => {
  const f = await fixture(t);
  const result = f.run(await f.fake('setInterval(() => {}, 1000);'), ['--timeout-seconds', '1']);
  assert.equal(result.status, 124, result.stderr); assert.match(result.stderr, /timeout/);
});

test('SIGINT e SIGTERM sono inoltrati e prevalgono su result success', { ...posix, timeout: 10000 }, async t => {
  const f = await fixture(t);
  for (const [signal, expected] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const executable = await f.fake(`process.on(${JSON.stringify(signal)}, () => { ${emitSuccess} process.exit(0); }); console.log(JSON.stringify({type:'system',ready:true})); setInterval(() => {}, 1000);`);
    const child = spawn(process.execPath, [launcher, ...f.args], { env: { ...process.env, CLAUDE_BIN: executable }, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; });
    const closed = once(child, 'close'); await once(child.stdout, 'data');
    assert.match(output, /ready/); child.kill(signal);
    const [code] = await closed; assert.equal(code, expected); assert.match(output, /"subtype":"success"/);
  }
});

test('un worker che ignora SIGTERM viene forzato e i listener sono rimossi', { ...posix, timeout: 10000 }, async t => {
  const f = await fixture(t);
  const executable = await f.fake(`process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`);
  const invocation = await prepareInvocation(parseArgs(f.args), { CLAUDE_BIN: executable }); invocation.timeoutMs = 500;
  const before = process.listenerCount('SIGTERM');
  assert.equal(await runClaude(invocation, { killGraceMs: 50 }), 124);
  assert.equal(process.listenerCount('SIGTERM'), before);
});
