import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { parseArgs, prepareInvocation, runOpenCode } from '../scripts/opencode.mjs';

const launcher = fileURLToPath(new URL('../scripts/opencode.mjs', import.meta.url));

async function fixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'games opencode ')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const project = path.join(base, 'project with spaces');
  const binDir = path.join(base, 'fake bin');
  await fs.mkdir(project); await fs.mkdir(binDir);
  await fs.mkdir(path.join(project, 'tasks'));
  const brief = 'tasks/brief $(touch injected).md';
  await fs.writeFile(path.join(project, brief), '# Incarico\nwrite_scope: []\nSolo fixture; nessun modello.');
  const fake = async source => {
    const executable = path.join(binDir, 'opencode');
    await fs.writeFile(executable, `#!${process.execPath}\n${source}\n`, { mode: 0o755 });
    return executable;
  };
  const args = ['--project-root', project, '--brief', brief];
  return { base, project, binDir, brief, fake, args };
}

test('argomenti: richiede root assoluta, brief relativo e limiti espliciti validi', () => {
  assert.deepEqual(parseArgs(['--help']), { help: true });
  for (const args of [
    [], ['--project-root', 'relative', '--brief', 'brief.md'],
    ['--project-root', '/tmp/project', '--brief', '/tmp/brief.md'],
    ['--project-root', '/tmp/project', '--brief', 'brief.md', '--model', 'unknown'],
    ['--project-root', '/tmp/project', '--brief', 'brief.md', '--model', '-provider/model'],
    ['--project-root', '/tmp/project', '--brief', 'C:\\other\\brief.md'],
    ['--project-root', '/tmp/project', '--brief', 'tasks/../brief.md'],
    ['--project-root', '/tmp/project', '--brief', 'brief.md', '--timeout-seconds', '0'],
    ['--project-root', '/tmp/project', '--brief', 'brief.md', '--timeout-seconds', '1.5'],
    ['--project-root', '/tmp/project', '--brief', 'brief.md', '--timeout-seconds', '86401'],
    ['--project-root', '/tmp/project', '--brief', 'brief.md', '--auto'],
    ['--project-root', '/tmp/project', '--brief', 'brief.md', '--brief', 'other.md'],
  ]) assert.throws(() => parseArgs(args));
});

test('il brief deve essere un file interno non vuoto, anche risolvendo i symlink', async t => {
  const f = await fixture(t);
  const prepare = async brief => prepareInvocation(parseArgs(['--project-root', f.project, '--brief', brief]));
  await assert.rejects(prepare('tasks/missing.md'), /ENOENT/);
  await fs.writeFile(path.join(f.project, 'empty.md'), ' \n');
  await assert.rejects(prepare('empty.md'), /non vuoto/);
  await assert.rejects(prepare('tasks'), /non vuoto/);
  await fs.writeFile(path.join(f.base, 'outside.md'), 'outside');
  await assert.rejects(prepare('../outside.md'), /senza attraversamenti/);
  await fs.symlink(path.join(f.base, 'outside.md'), path.join(f.project, 'linked.md'));
  await assert.rejects(prepare('linked.md'), /symlink/);
  await fs.symlink(f.base, path.join(f.project, 'outside-dir'));
  await assert.rejects(prepare('outside-dir/outside.md'), /symlink/);
});

test('rifiuta allegati riservati diretti e alias interni, prima di leggerli', async t => {
  const f = await fixture(t);
  for (const brief of ['.env', '.env.local', 'tasks/.env.example', '.git/config', '.games/local.md', '.codex/brief.md', '.claude/brief.md', '.ENV.LOCAL']) {
    assert.throws(() => parseArgs(['--project-root', f.project, '--brief', brief]), /riservato/);
  }
  await fs.mkdir(path.join(f.project, '.games'));
  await fs.writeFile(path.join(f.project, '.games', 'fixture.md'), 'Synthetic reserved input, no credentials.');
  await fs.symlink(path.join(f.project, '.games', 'fixture.md'), path.join(f.project, 'alias.md'));
  await assert.rejects(prepareInvocation(parseArgs(['--project-root', f.project, '--brief', 'alias.md'])), /riservato/);
});

test('esecuzione senza shell: argv e allegato restano distinti, exit del worker propagato', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t);
  const executable = await f.fake(`console.log(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() })); process.exitCode = 7;`);
  const model = 'provider/model-with-$()-literal';
  const result = spawnSync(process.execPath, [launcher, ...f.args, '--model', model], {
    env: { ...process.env, OPENCODE_BIN: executable }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 7, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.cwd, f.project);
  assert.equal(output.argv[0], 'run');
  assert.match(output.argv[1], /brief allegato/);
  assert.deepEqual(output.argv.slice(2), ['--format', 'json', '--dir', f.project, '--model', model, '--file', path.join(f.project, f.brief)]);
  await assert.rejects(fs.access(path.join(f.project, 'injected')), /ENOENT/);
});

test('risolve PATH senza OPENCODE_BIN e non imposta un modello; binario assente restituisce 127', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t);
  await f.fake('console.log(JSON.stringify(process.argv.slice(2)));');
  const env = { ...process.env, PATH: `${f.binDir}${path.delimiter}${process.env.PATH}` };
  delete env.OPENCODE_BIN;
  const success = spawnSync(process.execPath, [launcher, ...f.args], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).includes('--model'), false);
  const absent = spawnSync(process.execPath, [launcher, ...f.args], {
    env: { ...env, OPENCODE_BIN: path.join(f.base, 'absent') }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(absent.status, 127);
  assert.match(absent.stderr, /ENOENT/);
});

test('timeout ferma il worker e restituisce 124', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const f = await fixture(t);
  const executable = await f.fake('setInterval(() => {}, 1000);');
  const result = spawnSync(process.execPath, [launcher, ...f.args, '--timeout-seconds', '1'], {
    env: { ...process.env, OPENCODE_BIN: executable }, encoding: 'utf8', timeout: 8000,
  });
  assert.equal(result.status, 124, result.stderr);
  assert.match(result.stderr, /timeout/);
});

test('SIGTERM viene inoltrato e il launcher non presenta l’interruzione come successo', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const f = await fixture(t);
  const executable = await f.fake(`process.on('SIGTERM', () => { console.log('TERMINATED'); process.exit(0); }); console.log('READY'); setInterval(() => {}, 1000);`);
  const child = spawn(process.execPath, [launcher, ...f.args], {
    env: { ...process.env, OPENCODE_BIN: executable }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  const closed = once(child, 'close');
  await once(child.stdout, 'data');
  assert.match(output, /READY/);
  child.kill('SIGTERM');
  const [code] = await closed;
  assert.equal(code, 143);
  assert.match(output, /TERMINATED/);
});

test('timeout forza anche un worker che ignora SIGTERM e rimuove i listener', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const f = await fixture(t);
  const executable = await f.fake(`process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`);
  const invocation = await prepareInvocation(parseArgs(f.args), { OPENCODE_BIN: executable });
  invocation.timeoutMs = 500;
  const before = process.listenerCount('SIGTERM');
  assert.equal(await runOpenCode(invocation, { killGraceMs: 50 }), 124);
  assert.equal(process.listenerCount('SIGTERM'), before);
});
