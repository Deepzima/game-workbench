import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jsonc from 'jsonc-parser';
import TOML from '@iarna/toml';
import { configureMemory as configureReal, memoryEntry, parseArgs, report, isConfigIgnored } from '../scripts/memory-adapters.mjs';
import { installDependencies, runSetup, parseSetupArgs, assertNodeVersion } from '../scripts/setup.mjs';

const configureMemory = options => configureReal({ isIgnored: () => true, ...options });

const definition = () => ({
  id: 'games-memory', transport: 'stdio', runtime: 'node', entrypoint: 'mcp/memory/server.mjs',
  args: ['--hub-root', { root: 'hub' }], project_args: ['--project-root', { root: 'project' }],
  env: { MISE_AUTO_INSTALL: 'false' },
});

async function seedCatalog(root) {
  await fs.mkdir(path.join(root, 'mcp/memory'), { recursive: true });
  await fs.writeFile(path.join(root, 'mcp/memory/server.mjs'), '// fixture MCP entrypoint\n');
  await fs.writeFile(path.join(root, 'hub.json'), JSON.stringify({ schema_version: 1, mcp_servers: [definition()] }));
}

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'games memory setup ')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const hub = path.join(root, 'hub space & literal');
  const project = path.join(root, 'external worktree');
  await fs.mkdir(hub);
  await fs.mkdir(project);
  await seedCatalog(hub);
  async function put(relative, content, base = hub) {
    const filename = path.join(base, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, content);
    return filename;
  }
  const read = (relative, base = hub) => fs.readFile(path.join(base, relative), 'utf8');
  return { root, hub, project, put, read };
}

test('genera snippet locali per tre client senza cambiare configurazioni o memoria', async t => {
  const f = await fixture(t);
  await f.put('memory/decision.md', 'decisione persistente');
  const existing = '{"servers":{"other":{"command":"other","env":{"TOKEN":"private-token"}}}}';
  await f.put('.vscode/mcp.json', existing);
  const result = await configureMemory({ hubRoot: f.hub });
  assert.equal(result.generated.length, 3);
  assert.equal(result.applied, null);
  assert.equal(await f.read('.vscode/mcp.json'), existing);
  assert.equal(await f.read('memory/decision.md'), 'decisione persistente');
  const entry = JSON.parse(await f.read('.games/local/games-memory.vscode.json')).servers['games-memory'];
  assert.deepEqual(entry, await memoryEntry(f.hub, undefined, 'vscode'));
  assert.deepEqual(entry.args, ['-C', '${workspaceFolder}', 'exec', '--no-deps', '--', 'node', 'mcp/memory/server.mjs', '--hub-root', '${workspaceFolder}']);
  assert.equal(entry.command, 'mise');
  assert.deepEqual(entry.env, { MISE_AUTO_INSTALL: 'false' });
  const claudeEntry = JSON.parse(await f.read('.games/local/games-memory.claude.json')).mcpServers['games-memory'];
  const codexEntry = TOML.parse(await f.read('.games/local/games-memory.codex.toml')).mcp_servers['games-memory'];
  for (const generatedEntry of [claudeEntry, codexEntry]) {
    assert.equal(generatedEntry.args[3], '--no-deps');
    assert.deepEqual(generatedEntry.env, { MISE_AUTO_INSTALL: 'false' });
  }
  const output = [];
  report(result, value => output.push(value));
  assert.doesNotMatch(output.join('\n'), /private-token/);
  assert.equal(TOML.parse(await f.read('.games/local/games-memory.codex.toml')).mcp_servers['games-memory'].command, 'mise');
  await assert.rejects(fs.access(path.join(f.hub, '.mcp.json')));
});

test('entrypoint, argomenti e ambiente del catalogo aggiornano i tre formati nativi', async t => {
  const f = await fixture(t);
  await configureMemory({ hubRoot: f.hub });
  const changed = {
    ...definition(), entrypoint: 'mcp/memory/replacement.mjs',
    args: ['--hub-root', { root: 'hub' }, '--label', 'from catalog'],
    project_args: ['--project-root', { root: 'project' }, '--project-label', 'project value'],
    env: { MISE_AUTO_INSTALL: 'false', MEMORY_MODE: 'from-catalog' },
  };
  await f.put(changed.entrypoint, '// alternate fixture entrypoint\n');
  await f.put('hub.json', JSON.stringify({ schema_version: 1, mcp_servers: [changed] }));
  for (const projectRoot of [undefined, f.project]) {
    await configureMemory({ hubRoot: f.hub, projectRoot });
    const base = projectRoot ?? f.hub;
    const entries = {
      vscode: JSON.parse(await f.read('.games/local/games-memory.vscode.json', base)).servers['games-memory'],
      claude: JSON.parse(await f.read('.games/local/games-memory.claude.json', base)).mcpServers['games-memory'],
      codex: TOML.parse(await f.read('.games/local/games-memory.codex.toml', base)).mcp_servers['games-memory'],
    };
    for (const [client, entry] of Object.entries(entries)) {
      const portable = client === 'vscode' && !projectRoot;
      assert.deepEqual(entry.args, [
        '-C', portable ? '${workspaceFolder}' : f.hub, 'exec', '--no-deps', '--', 'node',
        portable ? changed.entrypoint : path.join(f.hub, changed.entrypoint),
        '--hub-root', portable ? '${workspaceFolder}' : f.hub, '--label', 'from catalog',
        ...(projectRoot ? ['--project-root', f.project, '--project-label', 'project value'] : []),
      ]);
      assert.deepEqual(entry.env, changed.env);
      assert.equal(entry.command, 'mise');
      assert.equal(entry.type, client === 'vscode' ? 'stdio' : undefined);
    }
  }
});

test('catalogo invalido o games-memory assente falliscono prima di creare file locali', async t => {
  const f = await fixture(t);
  const original = '{"servers":{"custom":{"command":"keep"}}}\n';
  await f.put('.vscode/mcp.json', original);
  const invalid = [
    '{not-valid-json', {}, { mcp_servers: [] },
    { mcp_servers: [{ ...definition(), id: 'another-server' }] },
    { mcp_servers: [{ ...definition(), runtime: 'unknown-runtime' }] },
    { mcp_servers: [{ ...definition(), entrypoint: 'mcp/memory/missing.mjs' }] },
  ];
  for (const catalog of invalid) {
    await f.put('hub.json', typeof catalog === 'string' ? catalog : JSON.stringify({ schema_version: 1, ...catalog }));
    await assert.rejects(configureMemory({ hubRoot: f.hub, client: 'vscode', apply: true }));
    await assert.rejects(fs.access(path.join(f.hub, '.games')));
    assert.equal(await f.read('.vscode/mcp.json'), original);
  }
  await fs.rm(path.join(f.hub, 'hub.json'));
  await assert.rejects(configureMemory({ hubRoot: f.hub }));
  await assert.rejects(fs.access(path.join(f.hub, '.games')));
});

test('apply usa lo stesso catalogo della preview anche se il file cambia durante l’operazione', async t => {
  const f = await fixture(t);
  const expected = await memoryEntry(f.hub, f.project, 'claude');
  let ignoreChecks = 0;
  await configureReal({
    hubRoot: f.hub, projectRoot: f.project, client: 'claude', apply: true,
    isIgnored: async () => {
      ignoreChecks++;
      // This callback runs after snippet generation, before client application.
      await f.put('hub.json', '{changed after the validated snapshot');
      return true;
    },
  });
  assert.equal(ignoreChecks, 1);
  const preview = JSON.parse(await f.read('.games/local/games-memory.claude.json', f.project)).mcpServers['games-memory'];
  const applied = JSON.parse(await f.read('.mcp.json', f.project)).mcpServers['games-memory'];
  assert.deepEqual(preview, expected);
  assert.deepEqual(applied, expected);
});

test('progetto esterno: config e ownership restano nel progetto, server nel checkout hub', async t => {
  const f = await fixture(t);
  const result = await configureMemory({ hubRoot: f.hub, projectRoot: f.project, client: 'claude', apply: true });
  assert.equal(result.root, f.project);
  const entry = JSON.parse(await f.read('.mcp.json', f.project)).mcpServers['games-memory'];
  assert.deepEqual(entry, await memoryEntry(f.hub, f.project, 'claude'));
  assert.deepEqual(entry.args.slice(-2), ['--project-root', f.project]);
  assert.ok(result.generated.every(filename => filename.startsWith(f.project + path.sep)));
  await assert.rejects(fs.access(path.join(f.hub, '.games')));
  const second = await configureMemory({ hubRoot: f.hub, projectRoot: f.project, client: 'claude', apply: true });
  assert.equal(second.changed, false);
});

test('rifiuta hub e progetto coincidenti anche via symlink prima di creare file locali', async t => {
  const f = await fixture(t);
  const original = '{"servers":{"custom":{"command":"keep"}}}\n';
  await f.put('.vscode/mcp.json', original);
  const alias = path.join(f.root, 'hub alias');
  await fs.symlink(f.hub, alias, 'dir');
  for (const projectRoot of [f.hub, alias]) {
    await assert.rejects(configureMemory({ hubRoot: f.hub, projectRoot, client: 'vscode', apply: true }), /checkout distinti/);
    assert.equal(await f.read('.vscode/mcp.json'), original);
    await assert.rejects(fs.access(path.join(f.hub, '.games')));
  }
});

test('merge JSONC conserva commenti, server, input e segreti senza stamparli; applicazione idempotente', async t => {
  const f = await fixture(t);
  const original = '{\n  // custom comment\n  "servers": {"custom": {"command": "tool", "env": {"TOKEN": "secret-value"}},},\n  "inputs": [{"id": "personal"}],\n}\n';
  await f.put('.vscode/mcp.json', original);
  const result = await configureMemory({ hubRoot: f.hub, client: 'vscode', apply: true });
  assert.equal(result.changed, true);
  const current = await f.read('.vscode/mcp.json');
  assert.ok(current.includes('// custom comment'));
  assert.deepEqual(jsonc.parse(current).servers.custom, jsonc.parse(original).servers.custom);
  assert.deepEqual(jsonc.parse(current).inputs, [{ id: 'personal' }]);
  const output = [];
  report(result, value => output.push(value));
  assert.doesNotMatch(output.join('\n'), /secret-value/);
  const again = await configureMemory({ hubRoot: f.hub, client: 'vscode', apply: true });
  assert.equal(again.changed, false);
  assert.equal(await f.read('.vscode/mcp.json'), current);
  await assert.rejects(fs.access(path.join(f.hub, '.mcp.json')));
});

test('non sovrascrive un entry diversa non gestita né una modifica locale dell’entry gestita', async t => {
  const f = await fixture(t);
  const custom = '{"mcpServers":{"games-memory":{"command":"private-custom-command"}}}';
  await f.put('.mcp.json', custom);
  await assert.rejects(configureMemory({ hubRoot: f.hub, client: 'claude', apply: true }), error => {
    assert.match(error.message, /non gestita/);
    assert.doesNotMatch(error.message, /private-custom-command/);
    return true;
  });
  assert.equal(await f.read('.mcp.json'), custom);
  await fs.rm(path.join(f.hub, '.mcp.json'));
  await configureMemory({ hubRoot: f.hub, client: 'claude', apply: true });
  const modified = JSON.parse(await f.read('.mcp.json'));
  modified.mcpServers['games-memory'].command = 'user-customized';
  await f.put('.mcp.json', JSON.stringify(modified));
  await assert.rejects(configureMemory({ hubRoot: f.hub, client: 'claude', apply: true }), /non gestita/);
  assert.equal(JSON.parse(await f.read('.mcp.json')).mcpServers['games-memory'].command, 'user-customized');
});

test('aggiorna percorsi gestiti se il progetto usa un nuovo checkout del hub', async t => {
  const f = await fixture(t);
  const secondHub = path.join(f.root, 'new hub');
  await fs.mkdir(secondHub);
  await seedCatalog(secondHub);
  await configureMemory({ hubRoot: f.hub, projectRoot: f.project, client: 'claude', apply: true });
  const result = await configureMemory({ hubRoot: secondHub, projectRoot: f.project, client: 'claude', apply: true });
  assert.equal(result.changed, true);
  assert.deepEqual(JSON.parse(await f.read('.mcp.json', f.project)).mcpServers['games-memory'], await memoryEntry(secondHub, f.project, 'claude'));
});

test('rifiuta registrazione contemporanea VS Code/Claude per evitare doppio MCP', async t => {
  for (const [first, second] of [['vscode', 'claude'], ['claude', 'vscode']]) {
    const f = await fixture(t);
    await configureMemory({ hubRoot: f.hub, client: first, apply: true });
    await assert.rejects(configureMemory({ hubRoot: f.hub, client: second, apply: true }), /duplicazioni/);
  }
});

test('merge TOML conserva byte esterni al blocco e aggiorna solo il proprio server', async t => {
  const f = await fixture(t);
  const original = '# custom codex\nmodel = "chosen"\n\n[mcp_servers.other]\ncommand = "tool"\n[mcp_servers.other.env]\nTOKEN = "do-not-print"\n';
  await f.put('.codex/config.toml', original, f.project);
  await configureMemory({ hubRoot: f.hub, projectRoot: f.project, client: 'codex', apply: true });
  const initial = await f.read('.codex/config.toml', f.project);
  assert.ok(initial.startsWith(original));
  const secondHub = path.join(f.root, 'next hub');
  await fs.mkdir(secondHub);
  await seedCatalog(secondHub);
  await configureMemory({ hubRoot: secondHub, projectRoot: f.project, client: 'codex', apply: true });
  const updated = await f.read('.codex/config.toml', f.project);
  assert.ok(updated.startsWith(original));
  assert.deepEqual(TOML.parse(updated).mcp_servers.other, TOML.parse(original).mcp_servers.other);
  assert.deepEqual(TOML.parse(updated).mcp_servers['games-memory'], await memoryEntry(secondHub, f.project, 'codex'));
  const again = await configureMemory({ hubRoot: secondHub, projectRoot: f.project, client: 'codex', apply: true });
  assert.equal(again.changed, false);
  assert.equal(await f.read('.codex/config.toml', f.project), updated);
});

test('TOML riconosce chiavi quotate e rifiuta conflitti o blocchi che includono altre impostazioni', async t => {
  const f = await fixture(t);
  const conflict = '[mcp_servers."games-memory"]\ncommand = "private-value"\n';
  await f.put('.codex/config.toml', conflict);
  await assert.rejects(configureMemory({ hubRoot: f.hub, client: 'codex', apply: true }), error => {
    assert.match(error.message, /non gestita/);
    assert.doesNotMatch(error.message, /private-value/);
    return true;
  });
  assert.equal(await f.read('.codex/config.toml'), conflict);
  await fs.rm(path.join(f.hub, '.codex/config.toml'));
  await configureMemory({ hubRoot: f.hub, projectRoot: f.project, client: 'codex', apply: true });
  const initial = await f.read('.codex/config.toml', f.project);
  const edited = initial.replace('# END games-memory', '[unrelated]\nvalue = "keep"\n# END games-memory');
  await f.put('.codex/config.toml', edited, f.project);
  const secondHub = path.join(f.root, 'next hub');
  await fs.mkdir(secondHub);
  await seedCatalog(secondHub);
  await assert.rejects(configureMemory({ hubRoot: secondHub, projectRoot: f.project, client: 'codex', apply: true }), /altre impostazioni/);
  assert.equal(await f.read('.codex/config.toml', f.project), edited);
});

test('config malformata o chiavi JSON duplicate falliscono senza esporre contenuti', async t => {
  const f = await fixture(t);
  for (const content of ['{"private-secret":', '{"servers":{},"servers":{"games-memory":{"command":"hidden"}}}', '{"servers":[]}']) {
    await f.put('.vscode/mcp.json', content);
    await assert.rejects(configureMemory({ hubRoot: f.hub, client: 'vscode', apply: true }), error => {
      assert.doesNotMatch(error.message, /private-secret|hidden/);
      return true;
    });
    assert.equal(await f.read('.vscode/mcp.json'), content);
  }
});

test('rifiuta configurazioni e directory locali symlink senza scrivere fuori checkout', async t => {
  const f = await fixture(t);
  await fs.symlink(f.project, path.join(f.hub, '.games'), 'dir');
  await assert.rejects(configureMemory({ hubRoot: f.hub }), /simbolici/);
  assert.deepEqual(await fs.readdir(f.project), []);
  await fs.rm(path.join(f.hub, '.games'));
  const outside = await f.put('external.json', '{"servers":{}}', f.project);
  await fs.mkdir(path.join(f.hub, '.vscode'));
  await fs.symlink(outside, path.join(f.hub, '.vscode/mcp.json'));
  await assert.rejects(configureMemory({ hubRoot: f.hub, client: 'vscode', apply: true }), /simbolici/);
  assert.equal(await fs.readFile(outside, 'utf8'), '{"servers":{}}');
});

test('setup installa lockfile prima di generare e non procede dopo errore npm', async t => {
  const f = await fixture(t);
  const calls = [];
  await runSetup({ hubRoot: f.hub, client: 'vscode', install: options => calls.push(['install', options]), configure: options => { calls.push(['configure', options]); return 'done'; } });
  assert.deepEqual(calls.map(call => call[0]), ['install', 'configure']);
  assert.equal(calls[1][1].apply, false);
  await assert.rejects(runSetup({ hubRoot: f.hub, install: () => { throw new Error('npm failed'); }, configure: () => assert.fail('non deve configurare') }), /npm failed/);
  calls.length = 0;
  await runSetup({ hubRoot: f.hub, skipInstall: true, install: () => assert.fail('non deve installare'), configure: options => calls.push(options) });
  assert.equal(calls.length, 1);
});

test('npm usa argv separati senza shell, incluso entry JS Windows', () => {
  const calls = [];
  const spawn = (...args) => { calls.push(args); return { status: 0 }; };
  installDependencies({ hubRoot: '/tmp/hub & space', platform: 'linux', spawn });
  assert.deepEqual(calls[0], ['npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: '/tmp/hub & space', shell: false, windowsHide: true, stdio: 'inherit' }]);
  installDependencies({ hubRoot: 'fake windows hub', platform: 'win32', execPath: '/node install/node.exe', exists: () => true, spawn });
  assert.equal(calls[1][0], '/node install/node.exe');
  assert.equal(calls[1][1][0], '/node install/node_modules/npm/bin/npm-cli.js');
  assert.equal(calls[1][2].shell, false);
  assert.throws(() => installDependencies({ platform: 'win32', exists: () => false, spawn }), /npm non trovato/);
  assert.throws(() => installDependencies({ spawn: () => ({ status: 1 }) }), /non riuscita/);
});

test('CLI da cwd diverso risolve hub dal file e lascia config reali intatte', async t => {
  const f = await fixture(t);
  const script = fileURLToPath(new URL('../scripts/memory-adapters.mjs', import.meta.url));
  const expectedHub = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  const result = spawnSync(process.execPath, [script, '--project-root', f.project], { cwd: f.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const generated = JSON.parse(await f.read('.games/local/games-memory.vscode.json', f.project));
  assert.deepEqual(generated.servers['games-memory'], await memoryEntry(expectedHub, f.project, 'vscode'));
  await assert.rejects(fs.access(path.join(f.project, '.vscode/mcp.json')));
  const setupScript = fileURLToPath(new URL('../scripts/setup.mjs', import.meta.url));
  const setup = spawnSync(process.execPath, [setupScript, '--skip-install', '--client', 'claude', '--project-root', f.project], { cwd: f.root, encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr);
});

test('CLI valida client e richiede consenso esplicito --apply senza installare per argomenti invalidi', () => {
  for (const parse of [parseArgs, parseSetupArgs]) {
    assert.throws(() => parse(['--apply']), /--client/);
    assert.throws(() => parse(['--client', 'unknown']), /Client non valido/);
    assert.throws(() => parse(['--client']), /Valore mancante/);
    assert.throws(() => parse(['--client', 'vscode', '--client', 'claude']), /ripetuta/);
    assert.deepEqual(parse(['--client', 'vscode', '--apply']), { client: 'vscode', apply: true });
  }
  assert.throws(() => parseArgs(['--skip-install']), /non riconosciuta/);
  assert.deepEqual(parseSetupArgs(['--skip-install']), { skipInstall: true });
});

test('apply di percorsi assoluti richiede config ignorata e non tracciata; preview resta disponibile', async t => {
  const f = await fixture(t);
  const ignored = [];
  const isIgnored = (root, relative) => { ignored.push([root, relative]); return false; };
  await assert.rejects(configureReal({ hubRoot: f.hub, client: 'claude', apply: true, isIgnored }), /ignorato da Git e non tracciato/);
  assert.deepEqual(ignored, [[f.hub, '.mcp.json']]);
  await assert.rejects(fs.access(path.join(f.hub, '.mcp.json')));
  assert.ok(await fs.readFile(path.join(f.hub, '.games/local/games-memory.claude.json'), 'utf8'));
  await configureReal({ hubRoot: f.hub, client: 'codex', isIgnored: () => assert.fail('preview senza Git') });
  await configureReal({ hubRoot: f.hub, client: 'vscode', apply: true, isIgnored: () => assert.fail('entry portabile senza Git') });
  await assert.rejects(configureReal({ hubRoot: f.hub, projectRoot: f.project, client: 'vscode', apply: true, isIgnored }), /ignorato da Git e non tracciato/);
});

test('check-ignore senza no-index non promuove file tracciati, errore Git non apre la guardia', () => {
  let called;
  assert.equal(isConfigIgnored('/checkout & space', '.codex/config.toml', (...args) => { called = args; return { status: 0 }; }), true);
  assert.deepEqual(called[1], ['-C', '/checkout & space', 'check-ignore', '--quiet', '--', '.codex/config.toml']);
  assert.equal(called[2].shell, false);
  for (const result of [{ status: 1 }, { status: 128 }, { status: null, error: new Error('private') }]) {
    assert.equal(isConfigIgnored('/checkout', '.mcp.json', () => result), false);
  }
});

test('guardia Git reale: consente file ignorato ma rifiuta lo stesso file già tracciato', async t => {
  if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('Git non disponibile: la guardia fallisce chiusa; integrazione Git non verificabile.');
    return;
  }
  const f = await fixture(t);
  const git = args => spawnSync('git', ['-C', f.hub, ...args], { stdio: 'ignore', shell: false });
  assert.equal(git(['init', '--quiet']).status, 0);
  await f.put('.mcp.json', '{}\n');
  await f.put('.gitignore', '.mcp.json\n.games/local/\n');
  assert.equal(isConfigIgnored(f.hub, '.mcp.json'), true);
  assert.equal(git(['add', '--force', '--', '.mcp.json']).status, 0);
  assert.equal(isConfigIgnored(f.hub, '.mcp.json'), false);
  await assert.rejects(configureReal({ hubRoot: f.hub, client: 'claude', apply: true }), /ignorato da Git e non tracciato/);
  assert.equal(await f.read('.mcp.json'), '{}\n');
});

test('snippet e ownership sono ignorati anche senza regola .games/local nel progetto', async t => {
  if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('Git non disponibile per la verifica di status.');
    return;
  }
  const f = await fixture(t);
  const git = args => spawnSync('git', ['-C', f.project, ...args], { encoding: 'utf8', shell: false });
  assert.equal(git(['init', '--quiet']).status, 0);
  await configureReal({ hubRoot: f.hub, projectRoot: f.project });
  assert.equal(await f.read('.games/local/.gitignore', f.project), '*\n');
  assert.equal(git(['status', '--porcelain', '--untracked-files=all']).stdout, '');
  await f.put('.gitignore', '.codex/config.toml\n', f.project);
  await configureReal({ hubRoot: f.hub, projectRoot: f.project, client: 'codex', apply: true });
  const status = git(['status', '--porcelain', '--untracked-files=all']);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout.trim(), '?? .gitignore');
  assert.ok(await f.read('.games/local/memory-adapters-state.json', f.project));
});

test('preserva gitignore locale non protettivo e non genera snippet fino alla correzione', async t => {
  const f = await fixture(t);
  for (const content of ['# note\n', '*.json\n', '  *\n', '*\n!games-memory.codex.toml\n']) {
    await f.put('.games/local/.gitignore', content);
    await assert.rejects(configureReal({ hubRoot: f.hub }), /Aggiungere una riga finale \*/);
    assert.equal(await f.read('.games/local/.gitignore'), content);
    assert.deepEqual(await fs.readdir(path.join(f.hub, '.games/local')), ['.gitignore']);
  }
  const safe = '!old-exception\n*\n# final comment\n';
  await f.put('.games/local/.gitignore', safe);
  await configureReal({ hubRoot: f.hub });
  assert.equal(await f.read('.games/local/.gitignore'), safe);
});

test('rifiuta di riscrivere snippet o stato locale già tracciati da Git', async t => {
  if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('Git non disponibile per la verifica dell’indice.');
    return;
  }
  for (const target of ['.games/local/games-memory.vscode.json', '.games/local/memory-adapters-state.json']) {
    const f = await fixture(t);
    const git = args => spawnSync('git', ['-C', f.hub, ...args], { stdio: 'ignore', shell: false });
    assert.equal(git(['init', '--quiet']).status, 0);
    const original = 'local content to preserve\n';
    await f.put(target, original);
    assert.equal(git(['add', '--force', '--', target]).status, 0);
    await assert.rejects(configureReal({ hubRoot: f.hub, client: 'vscode', apply: true }), /già tracciata/);
    assert.equal(await f.read(target), original);
    await assert.rejects(fs.access(path.join(f.hub, '.games/local/.gitignore')));
    await assert.rejects(fs.access(path.join(f.hub, '.vscode/mcp.json')));
  }
});

test('setup rifiuta Node precedente al requisito prima di installare', async () => {
  for (const version of ['18.20.1', '22.23.1', '22.2.100']) assert.throws(() => assertNodeVersion(version), /Node >=22.23.2/);
  assert.throws(() => assertNodeVersion('not-a-version'), /non riconosciuta/);
  for (const version of ['v22.23.2', '22.24.0', '23.0.0', '24.0.0']) assert.doesNotThrow(() => assertNodeVersion(version));
  await assert.rejects(runSetup({ nodeVersion: '20.0.0', install: () => assert.fail('non deve installare') }), /Node >=22.23.2/);
});
