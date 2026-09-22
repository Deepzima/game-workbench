import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initWorkflow, loadWorkflow, runWorkflow, validateWorkflow, parseArgs } from '../scripts/workflow.mjs';

const source = fileURLToPath(new URL('../workflows/game-feature.json', import.meta.url));
const script = fileURLToPath(new URL('../scripts/workflow.mjs', import.meta.url));
const original = JSON.parse(await fs.readFile(source, 'utf8'));

async function fixture(t, definition = original) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'games workflow ')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const hubRoot = path.join(base, 'hub'), projectRoot = path.join(base, 'project space');
  await fs.mkdir(hubRoot); await fs.mkdir(projectRoot);
  const put = async (relative, content, root = projectRoot) => {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
    return file;
  };
  await put('workflows/game-feature.json', definition, hubRoot);
  await put('hub.json', { roles: [...new Set(original.steps.map(step => step.role))].map(id => ({ id })) }, hubRoot);
  await put('docs/brief.md', '# Feature\nProof sintetica, senza Unity o generazioni.\n');
  const common = { hubRoot, projectRoot, taskId: 'feature-one' };
  const run = (command, extra = {}) => runWorkflow({ ...common, command, ...extra });
  const init = (extra = {}) => initWorkflow({ ...common, brief: 'docs/brief.md', ...extra });
  const start = (step, mode = 'proof') => run('start', { step, executor: `test-runtime:${step}:fixture`, mode });
  const finish = async step => {
    const report = `tasks/feature-one/${step}/report.md`, evidence = `tasks/feature-one/${step}/evidence.json`;
    await put(report, `# Rapporto ${step}\nProva sintetica del workflow, nessuna esecuzione Unity.\n`);
    await put(evidence, { fixture: true, step });
    return run('finish', { step, report, evidence: [evidence] });
  };
  const complete = async step => { await start(step); return finish(step); };
  const decide = async (step, extra = {}) => {
    const decision = `tasks/feature-one/decisions/${step}.json`;
    await put(decision, { task_id: 'feature-one', step_id: step, decision: 'accept', user_statement: 'Sì, approvo.', source: 'synthetic-test:user-message-1', ...extra });
    return decision;
  };
  const state = () => fs.readFile(path.join(projectRoot, 'tasks/feature-one/workflow.json'), 'utf8');
  return { base, hubRoot, projectRoot, put, common, run, init, start, finish, complete, decide, state };
}

test('workflow e adattatori devono assegnare lo stesso ruolo nei nuovi cataloghi; legacy e adapter null restano validi', async t => {
  const definition = { schema_version: 1, id: 'build', description: 'Fixture mapping ruoli.', steps: [
    { id: 'build', role: 'builder', adapter: 'games-builder', objective: 'Solo fixture.', depends_on: [], write_scope: ['output/'] },
  ] };
  const f = await fixture(t, definition);
  const roles = ['builder', 'reviewer'].map(id => ({ id, file: `agents/${id}.md` }));
  const adapters = roles.map(role => ({ id: `games-${role.id}`, client: 'vscode', role: role.id, file: `.github/agents/games-${role.id}.agent.md` }));
  for (const role of roles) await f.put(role.file, `# ${role.id}\nResponsabilità fixture.`, f.hubRoot);
  for (const adapter of adapters) await f.put(adapter.file, `---\nname: ${adapter.id}\ndescription: Ruolo fixture\n---\nLeggi [ruolo](../../agents/${adapter.role}.md).`, f.hubRoot);
  await f.put('hub.json', { roles, adapters }, f.hubRoot);
  assert.equal((await loadWorkflow({ hubRoot: f.hubRoot })).definition.steps[0].adapter, 'games-builder');
  for (const adapter of ['games-reviewer', 'games-missing']) {
    definition.steps[0].adapter = adapter;
    await f.put('workflows/game-feature.json', definition, f.hubRoot);
    await assert.rejects(loadWorkflow({ hubRoot: f.hubRoot }), /Adattatore.*assente, ambiguo o incoerente/);
    await assert.rejects(f.init(), /Adattatore.*assente, ambiguo o incoerente/);
    await assert.rejects(f.state(), { code: 'ENOENT' });
  }
  await f.put('hub.json', { roles }, f.hubRoot);
  assert.equal((await loadWorkflow({ hubRoot: f.hubRoot })).definition.steps[0].adapter, 'games-missing');
  await f.put('hub.json', { roles, adapters: [] }, f.hubRoot);
  await assert.rejects(loadWorkflow({ hubRoot: f.hubRoot }), /Adattatore.*assente/);
  definition.steps[0].adapter = null;
  await f.put('workflows/game-feature.json', definition, f.hubRoot);
  assert.equal((await loadWorkflow({ hubRoot: f.hubRoot })).definition.steps[0].adapter, null);
});

test('checkpoint espliciti bloccano le dipendenze e la chiusura finale fino alla decisione registrata', async t => {
  const f = await fixture(t); await f.init({ reviewAfter: ['brief', 'review'] });
  const decision = await f.decide('brief');
  await assert.rejects(f.run('accept', { step: 'brief', decision }), /dopo il completamento/);
  await f.start('brief');
  await assert.rejects(f.run('accept', { step: 'brief', decision }), /dopo il completamento/);
  const finished = await f.finish('brief');
  assert.equal(finished.status, 'awaiting-approval');
  assert.deepEqual(finished.awaiting_approval, ['brief']);
  assert.deepEqual(finished.steps.filter(step => step.ready), []);
  const before = await f.state();
  const delivery = await f.run('handoff', { step: 'graphics' });
  assert.deepEqual(delivery.scheduling.approval_blockers, ['brief']);
  assert.equal(delivery.scheduling.can_start, false);
  await assert.rejects(f.start('graphics'), /Approvazione umana/);
  assert.equal(await f.state(), before);
  const accepted = await f.run('accept', { step: 'brief', decision });
  assert.equal(accepted.controls.approvals.find(item => item.step_id === 'brief').status, 'accepted');
  assert.equal(accepted.controls.acceptances.brief.decision.path, decision);
  assert.deepEqual(accepted.controls.acceptances.brief.delivery.report, accepted.steps.find(item => item.id === 'brief').report);
  assert.ok(!JSON.stringify(accepted).includes('synthetic-test:user-message-1'));
  await assert.rejects(f.run('accept', { step: 'brief', decision }), /già registrata/);
  await f.complete('graphics'); await f.complete('gameplay'); await f.complete('integration');
  const awaiting = await f.complete('review');
  assert.equal(awaiting.status, 'awaiting-approval');
  assert.deepEqual(awaiting.awaiting_approval, ['review']);
  const result = await f.run('accept', { step: 'review', decision: await f.decide('review') });
  assert.equal(result.status, 'completed');
});

test('approval verifica consegna, decisione e snapshot anche per antenati già consumati', async t => {
  const f = await fixture(t); await f.init({ reviewAfter: ['brief'] }); await f.complete('brief');
  const report = 'tasks/feature-one/brief/report.md';
  const originalReport = await fs.readFile(path.join(f.projectRoot, report), 'utf8');
  const decision = await f.decide('brief');
  await f.put(report, 'Report sostituito prima della decisione.');
  await assert.rejects(f.run('accept', { step: 'brief', decision }), /Input modificati/);
  await f.put(report, originalReport);
  await f.run('accept', { step: 'brief', decision });
  await f.put(report, 'Report sostituito dopo la decisione.');
  await assert.rejects(f.start('graphics'), /Input modificati/);
  assert.ok((await f.run('status')).controls.approvals[0].delivery_changes.some(change => change.path === report));
  await f.put(report, originalReport);
  await f.complete('graphics'); await f.complete('gameplay');
  // Direct consumers have finished; the immutable ancestor report is still binding.
  for (const remove of [false, true]) {
    if (remove) await fs.rm(path.join(f.projectRoot, report));
    else await f.put(report, 'Ancestor report altered after its direct consumers.');
    const drifted = await f.run('status');
    assert.equal(drifted.controls.approvals[0].status, 'invalid');
    assert.equal(drifted.steps.find(step => step.id === 'integration').ready, false);
    await assert.rejects(f.start('integration'), /Approvazione umana/);
    await f.put(report, originalReport);
  }
  const evidence = 'tasks/feature-one/brief/evidence.json';
  const originalEvidence = await fs.readFile(path.join(f.projectRoot, evidence), 'utf8');
  await f.put(evidence, 'Ancestor evidence altered outside any successor scope.');
  await assert.rejects(f.start('integration'), /Approvazione umana/);
  await f.put(evidence, originalEvidence);
  const originalDecision = await fs.readFile(path.join(f.projectRoot, decision), 'utf8');
  await f.put(decision, `${originalDecision}\n`);
  await assert.rejects(f.start('integration'), /Approvazione umana/);
  const changed = await f.run('status');
  assert.equal(changed.controls.approvals[0].status, 'invalid');
  assert.deepEqual(changed.steps.find(step => step.id === 'integration').approval_blockers, ['brief']);
  await f.put(decision, originalDecision);
  const unchangedState = await f.state();
  const replacement = JSON.parse(unchangedState);
  replacement.steps.brief.report.sha256 = '0'.repeat(64);
  await f.put('tasks/feature-one/workflow.json', replacement);
  await assert.rejects(f.start('integration'), /Approvazione umana/);
  assert.ok((await f.run('status')).controls.approvals[0].changes.some(change => change.reason === 'delivery-record-changed'));
  await f.put('tasks/feature-one/workflow.json', unchangedState);
  await f.start('integration');
});

test('checkpoint gameplay non impedisce integrazione e retry con aggiornamenti leciti agli script', async t => {
  const f = await fixture(t); await f.init({ reviewAfter: ['gameplay'] }); await f.complete('brief'); await f.complete('graphics');
  const scriptFile = 'unity/Assets/Scripts/Feature.cs', report = 'tasks/feature-one/gameplay/report.md';
  await f.start('gameplay'); await f.put(scriptFile, '// v1\n'); await f.put(report, 'Rapporto fixture gameplay.');
  await f.run('finish', { step: 'gameplay', report, evidence: [scriptFile] });
  await f.run('accept', { step: 'gameplay', decision: await f.decide('gameplay') });
  await f.put(scriptFile, '// external change before any authorized integration start\n');
  assert.equal((await f.run('status')).controls.approvals[0].status, 'invalid');
  await assert.rejects(f.start('integration'), /Input modificati/);
  await f.put(scriptFile, '// v1\n');
  await f.start('integration'); await f.put(scriptFile, '// v2 integrated\n');
  assert.equal((await f.run('status')).controls.approvals[0].status, 'accepted');
  await f.run('block', { step: 'integration', reason: 'Worker stopped for fixture.' });
  await f.put(scriptFile, '// external change after block\n');
  assert.equal((await f.run('status')).controls.approvals[0].status, 'invalid');
  await f.put(scriptFile, '// v2 integrated\n');
  await f.run('retry', { step: 'integration', reason: 'Resume the accepted scope.' });
  await f.start('integration');
  const integratedReport = 'tasks/feature-one/integration/report.md';
  await f.put(integratedReport, 'Rapporto fixture integrazione.');
  await f.run('finish', { step: 'integration', report: integratedReport, evidence: [scriptFile] });
  await f.complete('review');
  const result = await f.run('status');
  assert.equal(result.status, 'completed');
  assert.equal(result.controls.approvals[0].status, 'accepted');
  assert.ok(result.controls.approvals[0].delivery_changes.some(change => change.path === scriptFile));
  assert.deepEqual(result.input_changes, []);
  await f.put(scriptFile, '// external change after final delivery\n');
  assert.equal((await f.run('status')).controls.approvals[0].status, 'invalid');
  await f.put(scriptFile, '// v2 integrated\n');
  await f.put(integratedReport, 'Tracking report replaced after delivery.');
  assert.equal((await f.run('status')).controls.approvals[0].status, 'invalid');
});

test('scope di un discendente non autorizza cambiamenti a evidenze non ricevute nei suoi input', async t => {
  const definition = structuredClone(original);
  definition.steps[0].write_scope.push('unity/Assets/Scripts/');
  const f = await fixture(t, definition); await f.init({ reviewAfter: ['brief'] }); await f.start('brief');
  const scriptFile = 'unity/Assets/Scripts/Untracked.cs', report = 'tasks/feature-one/brief/report.md';
  await f.put(scriptFile, '// approved original\n'); await f.put(report, 'Brief fixture with a shared script.');
  await f.run('finish', { step: 'brief', report, evidence: [scriptFile] });
  await f.run('accept', { step: 'brief', decision: await f.decide('brief') });
  await f.complete('graphics'); await f.complete('gameplay');
  const running = await f.start('integration');
  assert.equal(running.inputs.some(input => input.path === scriptFile), false);
  await f.put(scriptFile, '// changed without a tracked handoff\n');
  assert.equal((await f.run('status')).controls.approvals[0].status, 'invalid');
  await f.finish('integration');
  await assert.rejects(f.start('review'), /Approvazione umana/);
});

test('ID constructor e to-string sono chiavi proprie, senza approvazioni ereditate dal prototipo', async t => {
  for (const id of ['constructor', 'to-string']) {
    const definition = structuredClone(original);
    definition.steps = [{ ...definition.steps[0], id, write_scope: [`tasks/{task_id}/${id}/`] }];
    const f = await fixture(t, definition);
    const initial = await f.init({ reviewAfter: [id] });
    assert.equal(initial.controls.approvals[0].status, 'not-ready');
    assert.equal(Object.hasOwn(initial.controls.acceptances, id), false);
    await f.complete(id);
    const accepted = await f.run('accept', { step: id, decision: await f.decide(id) });
    assert.equal(accepted.status, 'completed');
    assert.equal(Object.hasOwn(accepted.controls.acceptances, id), true);
    assert.equal((await f.run('status')).controls.approvals[0].status, 'accepted');
  }
});

test('pause blocca nuovi start ma non interrompe finish, block e registrazione delle decisioni', async t => {
  const f = await fixture(t); await f.init({ reviewAfter: ['brief'] }); await f.start('brief');
  await assert.rejects(f.run('pause'), /reason/);
  const paused = await f.run('pause', { reason: 'Confronto richiesto dall’utente.' });
  assert.equal(paused.status, 'paused');
  assert.equal(paused.steps.find(step => step.id === 'brief').status, 'running');
  assert.equal((await f.run('handoff', { step: 'brief' })).controls.paused, true);
  await assert.rejects(f.run('pause', { reason: 'Already paused.' }), /già in pausa/);
  await f.finish('brief');
  await f.run('accept', { step: 'brief', decision: await f.decide('brief') });
  await assert.rejects(f.start('graphics'), /Workflow in pausa/);
  const delivery = await f.run('handoff', { step: 'graphics' });
  assert.equal(delivery.scheduling.paused, true);
  assert.equal(delivery.scheduling.can_start, false);
  await assert.rejects(f.run('resume'), /reason/);
  const resumed = await f.run('resume', { reason: 'L’utente ha chiarito il punto; proseguire.' });
  assert.equal(resumed.controls.paused, false);
  assert.deepEqual(resumed.controls.history.map(event => event.action), ['pause', 'resume']);
  await assert.rejects(f.run('resume', { reason: 'Not paused.' }), /non in pausa/);
  await f.start('graphics'); await f.start('gameplay');
  await f.run('pause', { reason: 'Confronto durante il lavoro parallelo.' });
  await f.run('block', { step: 'graphics', reason: 'Runtime fermato dal coordinatore.' });
  await f.finish('gameplay');
  const current = await f.run('status');
  assert.equal(current.status, 'paused');
  assert.equal(current.steps.find(step => step.id === 'graphics').status, 'blocked');
  assert.equal(current.steps.find(step => step.id === 'gameplay').status, 'completed');
});

test('run precedenti senza controls restano leggibili senza migrazione o checkpoint impliciti', async t => {
  const f = await fixture(t); await f.init(); await f.complete('brief');
  const oldRun = JSON.parse(await f.state()); delete oldRun.controls;
  await f.put('tasks/feature-one/workflow.json', oldRun);
  const before = await f.state(), result = await f.run('status');
  assert.deepEqual(result.controls.review_after, []);
  assert.equal(result.controls.paused, false);
  assert.equal(await f.state(), before);
  await f.start('graphics');
  assert.equal(JSON.parse(await f.state()).steps.brief.status, 'completed');
});

test('decisioni richiedono contenuto contestualizzato, percorsi sicuri e nessun alias o segreto', async t => {
  const f = await fixture(t); await f.init({ reviewAfter: ['brief'] }); await f.complete('brief');
  const decision = await f.decide('brief'), before = await f.state();
  for (const value of ['successo', '   ', {}, { task_id: 'another-task' }, { user_statement: ' ' }, { source: '' }, { decision: 'reject' }, { step_id: 'graphics' }]) {
    if (typeof value === 'string') await f.put(decision, value); else await f.decide('brief', value);
    if (Object.keys(value).length === 0 && typeof value === 'object') await f.put(decision, value);
    await assert.rejects(f.run('accept', { step: 'brief', decision }), /Decisione umana/);
  }
  await assert.rejects(f.run('accept', { step: 'brief', decision: '../decision.json' }), /relativo/);
  await assert.rejects(f.run('accept', { step: 'brief', decision: path.join(f.projectRoot, decision) }), /relativo/);
  const valid = await f.decide('brief');
  await fs.symlink(path.join(f.projectRoot, valid), path.join(f.projectRoot, 'decision-alias.json'));
  await assert.rejects(f.run('accept', { step: 'brief', decision: 'decision-alias.json' }), /symlink/);
  for (const reserved of ['.env', '.ENV.local', '.games/decision.json', '.GAMES/decision.json', '.git/decision.json', '.codex/decision.json', '.claude/decision.json']) {
    await f.put(reserved, 'sensitive fixture marker');
    await assert.rejects(f.run('accept', { step: 'brief', decision: reserved }), error => /File riservato/.test(error.message) && !error.message.includes('sensitive fixture marker'));
  }
  assert.equal(await f.state(), before);
});

test('CLI rifiuta flag fuori comando e checkpoint o fasi inesistenti prima di mutare lo stato', async t => {
  const f = await fixture(t);
  assert.deepEqual(parseArgs(['init', '--review-after', 'brief', '--review-after', 'review']).reviewAfter, ['brief', 'review']);
  for (const args of [['init', '--review-aftr', 'brief'], ['start', '--review-after', 'brief'], ['pause', '--step', 'brief'], ['accept', '--reason', 'approved'], ['unknown']]) {
    assert.throws(() => parseArgs(args), /non riconosciut/);
  }
  await assert.rejects(f.init({ reviewAfter: ['missing'] }), /step non presente/);
  await assert.rejects(f.init({ reviewAfter: ['brief', 'brief'] }), /duplicato/);
  await assert.rejects(fs.access(path.join(f.projectRoot, 'tasks')));
  await f.init();
  const before = await f.state();
  await assert.rejects(f.run('accept', { step: 'missing', decision: 'missing.json' }), /Step non presente/);
  await assert.rejects(f.run('start', { step: 'brief', reviewAfter: ['brief'] }), /soltanto per init/);
  assert.equal(await f.state(), before);
});

test('DAG: grafica e gameplay lavorano insieme; integrazione attende entrambi; review non scrive', async t => {
  const f = await fixture(t);
  const initial = await f.init();
  assert.deepEqual(initial.steps.filter(step => step.ready).map(step => step.id), ['brief']);
  await assert.rejects(f.start('graphics'), /Dipendenza non completata/);
  await f.complete('brief');
  const graphics = await f.start('graphics'), gameplay = await f.start('gameplay');
  assert.equal(graphics.adapter, 'games-graphics');
  assert.equal(gameplay.adapter, 'games-programmer');
  assert.equal(graphics.project_root, f.projectRoot);
  assert.equal(graphics.hub_root, f.hubRoot);
  assert.deepEqual(graphics.write_scope, ['assets/', 'tasks/feature-one/graphics/']);
  assert.deepEqual(gameplay.write_scope, ['unity/Assets/Scripts/', 'tasks/feature-one/gameplay/']);
  const parallel = await f.run('status');
  assert.deepEqual(parallel.steps.filter(step => step.status === 'running').map(step => step.id), ['graphics', 'gameplay']);
  await f.finish('graphics');
  await assert.rejects(f.start('integration'), /gameplay/);
  await f.finish('gameplay');
  const integration = await f.start('integration');
  assert.deepEqual(integration.write_scope, ['unity/Assets/', 'tasks/feature-one/integration/']);
  assert.equal(integration.inputs.length, 6);
  await f.finish('integration');
  const review = await f.start('review');
  assert.deepEqual(review.write_scope, []);
  assert.match(review.report_instruction, /Non scrivere/);
  const result = await f.finish('review');
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.modes, ['proof']);
  assert.match(result.verification_note, /non attestano esecuzione Unity/);
  assert.ok(result.steps.every(step => step.status === 'completed' && /^[a-f0-9]{64}$/.test(step.report.sha256)));
});

test('finish richiede file distinti esistenti e conserva running quando le prove sono insufficienti', async t => {
  const f = await fixture(t); await f.init(); await f.start('brief');
  const before = await f.state();
  await assert.rejects(f.run('finish', { step: 'brief' }), /richiede/);
  const report = 'tasks/feature-one/brief/report.md', missing = 'tasks/feature-one/brief/missing.json';
  await assert.rejects(f.run('finish', { step: 'brief', report, evidence: [missing] }), /non accessibile/);
  await f.put(report, 'successo dichiarato');
  await assert.rejects(f.run('finish', { step: 'brief', report, evidence: [report] }), /distinti/);
  const empty = 'tasks/feature-one/brief/empty.txt';
  await f.put(empty, '');
  await assert.rejects(f.run('finish', { step: 'brief', report, evidence: [empty] }), /vuoto/);
  assert.equal(await f.state(), before);
  await f.finish('brief');
});

test('fallimento e retry mantengono gli altri rami e la cronologia; nessun retry automatico', async t => {
  const f = await fixture(t); await f.init(); await f.complete('brief');
  await f.start('graphics'); await f.start('gameplay');
  await f.run('block', { step: 'graphics', reason: 'Provider non disponibile; nessun nuovo tentativo autorizzato.', failed: true });
  await f.finish('gameplay');
  const failed = await f.run('status');
  assert.equal(failed.status, 'blocked');
  assert.equal(failed.steps.find(step => step.id === 'graphics').attempt, 1);
  const gameplay = JSON.stringify(failed.steps.find(step => step.id === 'gameplay'));
  await assert.rejects(f.start('graphics'), /pending/);
  const retried = await f.run('retry', { step: 'graphics', reason: 'Coordinatore dispone un nuovo tentativo circoscritto.' });
  const graphics = retried.steps.find(step => step.id === 'graphics');
  assert.equal(graphics.status, 'pending'); assert.equal(graphics.attempt, 1);
  assert.equal(graphics.history[0].status, 'failed');
  assert.equal(graphics.history[0].executor, 'test-runtime:graphics:fixture');
  assert.equal(JSON.stringify(retried.steps.find(step => step.id === 'gameplay')), gameplay);
  assert.equal((await f.start('graphics')).attempt, 2);
  await assert.rejects(f.run('retry', { step: 'gameplay', reason: 'invalid' }), /blocked o failed/);
});

test('ripresa carica lo stato su disco e non sovrascrive una run già presente', async t => {
  const f = await fixture(t); await f.init(); await f.complete('brief');
  const before = await f.state();
  await assert.rejects(f.init(), /già esistente/);
  assert.equal(await f.state(), before);
  const resumed = await runWorkflow({ ...f.common, command: 'status' });
  assert.deepEqual(resumed.steps.filter(step => step.ready).map(step => step.id), ['graphics', 'gameplay']);
  const handoff = await runWorkflow({ ...f.common, command: 'handoff', step: 'graphics' });
  assert.equal(handoff.executor, null);
  assert.equal(await f.state(), before);
  assert.equal(handoff.inputs[0].path, 'tasks/feature-one/workflow-inputs/brief.source');
});

test('modifiche a brief, definizione o copie congelate sono rilevate senza sovrascrivere gli snapshot', async t => {
  const f = await fixture(t); await f.init();
  const frozenBrief = await fs.readFile(path.join(f.projectRoot, 'tasks/feature-one/workflow-inputs/brief.source'), 'utf8');
  await f.put('docs/brief.md', '# Nuovo incarico non equivalente\n');
  assert.ok((await f.run('status')).input_changes.some(input => input.path === 'docs/brief.md'));
  await assert.rejects(f.start('brief'), /Input modificati/);
  assert.equal(await fs.readFile(path.join(f.projectRoot, 'tasks/feature-one/workflow-inputs/brief.source'), 'utf8'), frozenBrief);
  await f.put('docs/brief.md', frozenBrief);
  await f.put('workflows/game-feature.json', { ...original, description: 'definizione cambiata' }, f.hubRoot);
  assert.ok((await f.run('status')).input_changes.some(input => input.path === 'hub:workflows/game-feature.json'));
  await assert.rejects(f.start('brief'), /Input modificati/);
  await f.put('tasks/feature-one/workflow-inputs/brief.source', 'tampered');
  await assert.rejects(f.run('status'), /copie degli input/);
});

test('report di una dipendenza alterato blocca il join; input modificabili devono essere nelle evidenze finali', async t => {
  const f = await fixture(t); await f.init(); await f.complete('brief');
  await f.start('graphics'); await f.finish('graphics'); await f.start('gameplay');
  await f.put('unity/Assets/Scripts/Feature.cs', '// version 1\n');
  await f.put('tasks/feature-one/gameplay/report.md', 'Gameplay controllato come fixture.');
  await f.run('finish', { step: 'gameplay', report: 'tasks/feature-one/gameplay/report.md', evidence: ['unity/Assets/Scripts/Feature.cs'] });
  await f.start('integration');
  await f.put('unity/Assets/Scripts/Feature.cs', '// version 2, integrated\n');
  await assert.rejects(f.finish('integration'), /devono comparire nelle evidenze/);
  await f.run('finish', { step: 'integration', report: 'tasks/feature-one/integration/report.md', evidence: ['unity/Assets/Scripts/Feature.cs'] });
  await f.start('review');
  const status = await f.run('status');
  assert.deepEqual(status.input_changes, []);
  assert.ok(status.historical_input_changes.some(change => change.path === 'unity/Assets/Scripts/Feature.cs'));
  await f.put('tasks/feature-one/integration/report.md', 'changed after review start');
  await assert.rejects(f.finish('review'), /Input modificati/);
});

test('integration riprende modifiche lecite senza perdere hash originali o accettare alterazioni successive', async t => {
  const f = await fixture(t); await f.init(); await f.complete('brief'); await f.complete('graphics');
  const script = 'unity/Assets/Scripts/Feature.cs';
  const originalScript = '// original gameplay\n', integratedScript = '// integrated gameplay\n';
  const gameplayReport = 'tasks/feature-one/gameplay/report.md';
  const graphicsReport = 'tasks/feature-one/graphics/report.md';
  await f.start('gameplay'); await f.put(script, originalScript); await f.put(gameplayReport, 'Gameplay fixture');
  await f.run('finish', { step: 'gameplay', report: gameplayReport, evidence: [script] });

  // Owning the future write scope does not permit a first start on altered inputs,
  // even if the coordinator blocks and retries the phase before it ever runs.
  await f.put(script, '// modified before first start\n');
  await assert.rejects(f.start('integration'), /Input modificati/);
  await f.run('block', { step: 'integration', reason: 'Not yet started' });
  await f.run('retry', { step: 'integration', reason: 'Try initial start again' });
  await assert.rejects(f.start('integration'), /Input modificati/);
  await f.put(script, originalScript);
  const first = await f.start('integration');
  const originalHash = first.inputs.find(input => input.path === script).sha256;

  await f.put(script, integratedScript);
  const beforeHandoff = await f.state();
  const handoff = await f.run('handoff', { step: 'integration' });
  const integratedHash = handoff.current_inputs.find(input => input.path === script).sha256;
  assert.equal(handoff.inputs.find(input => input.path === script).sha256, originalHash);
  assert.notEqual(integratedHash, originalHash);
  assert.deepEqual(handoff.input_changes, [{ path: script, reason: 'changed' }]);
  assert.equal(await f.state(), beforeHandoff);

  const graphicsOriginal = await fs.readFile(path.join(f.projectRoot, graphicsReport), 'utf8');
  await f.put(graphicsReport, 'Unauthorized report change');
  await assert.rejects(f.run('handoff', { step: 'integration' }), /Input modificati/);
  await f.run('block', { step: 'integration', reason: 'Engine interrupted after valid script edits' });
  const blocked = JSON.parse(await f.state()).steps.integration;
  assert.equal(blocked.inputs.find(input => input.path === script).sha256, originalHash);
  assert.equal(blocked.resume_inputs.find(input => input.path === script).sha256, integratedHash);
  await assert.rejects(f.run('retry', { step: 'integration', reason: 'External report still altered' }), /Input modificati/);
  await f.put(graphicsReport, graphicsOriginal);

  await f.put(script, '// modified after block\n');
  await assert.rejects(f.run('retry', { step: 'integration', reason: 'Checkpoint changed' }), /Input modificati/);
  await f.put(script, integratedScript);
  const retried = await f.run('retry', { step: 'integration', reason: 'Engine available again' });
  const resumed = retried.steps.find(step => step.id === 'integration');
  assert.deepEqual(resumed.inputs, first.inputs);
  assert.deepEqual(resumed.history.at(-1).inputs, first.inputs);
  assert.deepEqual(resumed.history.at(-1).resume_inputs, blocked.resume_inputs);
  assert.deepEqual(retried.input_changes, []);

  await f.put(script, '// modified after retry\n');
  const pendingState = await f.state();
  await assert.rejects(f.run('handoff', { step: 'integration' }), /Input modificati/);
  await assert.rejects(f.start('integration'), /Input modificati/);
  assert.equal(await f.state(), pendingState);
  await f.put(script, integratedScript);
  const second = await f.start('integration');
  assert.equal(second.attempt, 2);
  assert.deepEqual(second.inputs, first.inputs);
  assert.equal(second.current_inputs.find(input => input.path === script).sha256, integratedHash);

  // If a later attempt loses a file, its last valid checkpoint stays current.
  await fs.rm(path.join(f.projectRoot, script));
  await f.run('block', { step: 'integration', reason: 'Script temporarily unavailable during second attempt' });
  const blockedAgain = JSON.parse(await f.state()).steps.integration;
  assert.equal(blockedAgain.resume_inputs.find(input => input.path === script).sha256, integratedHash);
  await assert.rejects(f.run('retry', { step: 'integration', reason: 'File still missing' }), /Input modificati/);
  await f.put(script, integratedScript);
  await f.run('retry', { step: 'integration', reason: 'Last valid checkpoint restored' });
  assert.equal((await f.start('integration')).attempt, 3);

  // An unchanged retry must still deliver the edits made in its previous attempt.
  await assert.rejects(f.finish('integration'), /devono comparire nelle evidenze/);
  await f.run('finish', { step: 'integration', report: 'tasks/feature-one/integration/report.md', evidence: [script] });
  await f.put(script, '// modified after final delivery\n');
  assert.ok((await f.run('status')).input_changes.some(change => change.path === script));
  await assert.rejects(f.start('review'), /Input modificati/);
  await f.put(script, integratedScript);
  await f.start('review');
  await f.put(script, '// modified during read-only review\n');
  await assert.rejects(f.finish('review'), /Input modificati/);
});

test('percorsi assoluti, traversal e symlink esterni sono rifiutati per brief, scope ed evidenze', async t => {
  const f = await fixture(t);
  await assert.rejects(initWorkflow({ ...f.common, brief: '../secret.md' }), /relativo/);
  await assert.rejects(initWorkflow({ ...f.common, brief: path.join(f.projectRoot, 'docs/brief.md') }), /relativo/);
  const outside = await f.put('outside.md', 'outside fixture', f.base);
  await fs.symlink(outside, path.join(f.projectRoot, 'external.md'));
  await assert.rejects(initWorkflow({ ...f.common, brief: 'external.md' }), /symlink/);
  await assert.rejects(fs.access(path.join(f.projectRoot, 'tasks')));
  await f.init(); await f.start('brief');
  const report = 'tasks/feature-one/brief/report.md';
  await f.put(report, 'report');
  await fs.symlink(outside, path.join(f.projectRoot, 'tasks/feature-one/brief/external.md'));
  await assert.rejects(f.run('finish', { step: 'brief', report, evidence: ['tasks/feature-one/brief/external.md'] }), /symlink/);
  await f.finish('brief');
  await fs.symlink(f.hubRoot, path.join(f.projectRoot, 'assets'), 'dir');
  await assert.rejects(f.start('graphics'), /symlink/);
  await assert.rejects(f.run('status', { taskId: '../other' }), /identificatore/);
});

test('uno scrittore per stato e nessuna sovrapposizione di scope tra rami running', async t => {
  const modified = structuredClone(original);
  modified.steps.find(step => step.id === 'graphics').write_scope = ['unity/Assets/'];
  const f = await fixture(t, modified); await f.init();
  await f.put('tasks/feature-one/.workflow.lock', 'other coordinator');
  await assert.rejects(f.start('brief'), /occupato/);
  assert.equal(await fs.readFile(path.join(f.projectRoot, 'tasks/feature-one/.workflow.lock'), 'utf8'), 'other coordinator');
  await fs.rm(path.join(f.projectRoot, 'tasks/feature-one/.workflow.lock'));
  await f.complete('brief'); await f.start('graphics');
  await assert.rejects(f.start('gameplay'), /Scope in conflitto/);
});

test('loader valida schema, ruoli, DAG e percorso della definizione senza esecuzione', async t => {
  const f = await fixture(t);
  assert.equal((await loadWorkflow({ hubRoot: f.hubRoot })).definition.id, 'game-feature');
  for (const modify of [
    value => value.steps.push(value.steps[0]),
    value => { value.steps[0].depends_on = ['review']; },
    value => { value.steps[0].depends_on = ['missing']; },
    value => { value.steps[4].write_scope = ['assets/']; },
    value => { value.steps[1].write_scope = ['../outside/']; },
    value => { value.steps[1].write_scope = ['tasks/{other}/']; },
  ]) {
    const definition = structuredClone(original); modify(definition);
    assert.throws(() => validateWorkflow(definition));
  }
  const badRole = structuredClone(original); badRole.steps[0].role = 'unknown';
  await f.put('workflows/game-feature.json', badRole, f.hubRoot);
  await assert.rejects(loadWorkflow({ hubRoot: f.hubRoot }), /Ruolo non presente/);
  await assert.rejects(loadWorkflow({ hubRoot: f.hubRoot, file: '../outside.json' }), /relativo/);
});

test('start richiede esecutore e modalità; stati corrotti non consentono retry di un antenato completato', async t => {
  const f = await fixture(t); await f.init();
  await assert.rejects(f.run('start', { step: 'brief', mode: 'proof' }), /executor/);
  await assert.rejects(f.run('start', { step: 'brief', executor: 'runtime:id' }), /mode/);
  await f.complete('brief'); await f.complete('graphics');
  const modified = JSON.parse(await f.state());
  modified.steps.brief.status = 'blocked';
  await f.put('tasks/feature-one/workflow.json', modified);
  await assert.rejects(f.run('retry', { step: 'brief', reason: 'unsafe' }), /dipendenza non completata/);
});

test('brief riservati sono rifiutati anche con maiuscole e alias senza copiarne il contenuto', async t => {
  const f = await fixture(t);
  for (const brief of ['.ENV', '.EnV.local', '.GAMES/local/brief.md', '.CODEX/config.toml', '.CLAUDE/settings.json', '.GIT/config']) {
    await f.put(brief, 'sensitive fixture marker');
    await assert.rejects(f.init({ brief }), error => /File riservato/.test(error.message) && !error.message.includes('sensitive fixture marker'));
  }
  await fs.symlink(path.join(f.projectRoot, '.ENV'), path.join(f.projectRoot, 'docs/uppercase-alias.md'));
  await assert.rejects(f.init({ brief: 'docs/uppercase-alias.md' }), /File riservato/);
  await assert.rejects(fs.stat(path.join(f.projectRoot, 'tasks/feature-one/workflow-inputs/brief.source')), { code: 'ENOENT' });
});

test('production non eredita prove simulate e le consegne rispettano scope e file riservati', async t => {
  const f = await fixture(t); await f.init(); await f.complete('brief');
  await assert.rejects(f.start('graphics', 'production'), /proof o dry-run/);
  await f.start('graphics');
  const report = 'tasks/feature-one/graphics/report.md';
  await f.put(report, 'Synthetic report');
  await f.put('assets/evidence.json', { fixture: true });
  await f.put('docs/outside-scope.json', { fixture: true });
  await assert.rejects(f.run('finish', { step: 'graphics', report: 'docs/outside-scope.json', evidence: ['assets/evidence.json'] }), /rapporto deve stare/);
  await assert.rejects(f.run('finish', { step: 'graphics', report, evidence: ['docs/outside-scope.json'] }), /fuori dallo scope/);
  for (const file of ['assets/.env', 'assets/.ENV.local', 'assets/.git/config', 'assets/.games/cache/private.json', 'assets/.GAMES/cache/private.json']) {
    await f.put(file, 'reserved fixture; never report its value');
    await assert.rejects(f.run('finish', { step: 'graphics', report, evidence: [file] }), /File riservato/);
  }
  await fs.symlink(path.join(f.projectRoot, 'docs/outside-scope.json'), path.join(f.projectRoot, 'assets/alias.json'));
  await assert.rejects(f.run('finish', { step: 'graphics', report, evidence: ['assets/alias.json'] }), /symlink/);
  await fs.symlink(path.join(f.projectRoot, 'assets/.env'), path.join(f.projectRoot, 'docs/brief-alias.md'));
  await assert.rejects(initWorkflow({ ...f.common, taskId: 'alias-run', brief: 'docs/brief-alias.md' }), /File riservato/);
  await f.run('finish', { step: 'graphics', report, evidence: ['assets/evidence.json'] });
});

test('CLI status da cwd diverso è di sola lettura e opzioni evidence ripetute sono preservate', async t => {
  const f = await fixture(t);
  // CLI uses the actual hub, while this fixture otherwise uses an isolated hub.
  await initWorkflow({ projectRoot: f.projectRoot, taskId: 'cli-proof', brief: 'docs/brief.md' });
  const result = spawnSync(process.execPath, [script, 'status', '--project-root', f.projectRoot, '--task-id', 'cli-proof'], { cwd: f.base, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'pending');
  assert.deepEqual(parseArgs(['finish', '--evidence', 'a', '--evidence', 'b']).evidence, ['a', 'b']);
  assert.throws(() => parseArgs(['start', '--step', 'a', '--step', 'b']), /ripetuta/);
});
