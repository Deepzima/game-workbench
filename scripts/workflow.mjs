#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import schema from '../schemas/workflow.schema.json' with { type: 'json' };
import { validateAgentAdapters } from './agent-adapters.mjs';

export const HUB_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const DEFAULT_WORKFLOW = 'workflows/game-feature.json';
const validateDefinition = new Ajv({ allErrors: true, strict: true }).compile(schema);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const MODES = ['production', 'proof', 'dry-run'];
const STATES = ['pending', 'running', 'completed', 'blocked', 'failed'];
const now = () => new Date().toISOString();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const isText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4000;
const validId = value => typeof value === 'string' && value.length <= 64 && ID.test(value);

function relativePath(value, { directory = false } = {}) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
      path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    fail('Percorso relativo al progetto richiesto, senza attraversamenti.');
  }
  const normalized = directory && value.endsWith('/') ? value.slice(0, -1) : value;
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) fail('Percorso relativo al progetto richiesto, senza attraversamenti.');
  return normalized;
}

async function rootDirectory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail('--project-root deve essere una directory assoluta esistente.');
  let root;
  try { root = await fs.realpath(value); if (!(await fs.stat(root)).isDirectory()) throw new Error(); }
  catch { fail('Root non accessibile o non valida.'); }
  return root;
}

async function safePath(root, relative, { write = false, missing = false } = {}) {
  const normalized = relativePath(relative);
  let current = root;
  for (const segment of normalized.split('/')) {
    current = path.join(current, segment);
    let info;
    try { info = await fs.lstat(current); }
    catch (error) {
      if (missing && error.code === 'ENOENT') continue;
      fail(`File non accessibile: ${relative}.`);
    }
    if (info.isSymbolicLink()) {
      if (write) fail('Le scritture dello stato non possono attraversare symlink.');
      let target;
      try { target = await fs.realpath(current); } catch { fail(`Symlink non risolvibile: ${relative}.`); }
      if (!inside(root, target)) fail(`Il percorso esce dal progetto tramite symlink: ${relative}.`);
    }
  }
  return current;
}

async function readFile(root, relative) {
  const reserved = value => value.toLowerCase().split('/').some(segment => ['.git', '.games', '.codex', '.claude'].includes(segment) || segment === '.env' || segment.startsWith('.env.'));
  if (reserved(relativePath(relative))) {
    fail('File riservato: configurazioni locali e credenziali non sono input o evidenze del workflow.');
  }
  const filename = await safePath(root, relative);
  if (reserved(path.relative(root, await fs.realpath(filename)).split(path.sep).join('/'))) fail('File riservato raggiunto tramite alias: non può diventare input o evidenza.');
  try {
    if (!(await fs.stat(filename)).isFile()) throw new Error();
    const bytes = await fs.readFile(filename);
    if (!bytes.length) fail(`File vuoto: ${relative}.`);
    return bytes;
  } catch (error) {
    if (error.message.startsWith('File vuoto:')) throw error;
    fail(`File non leggibile: ${relative}.`);
  }
}

async function artifact(root, relative, { noSymlinks = false } = {}) {
  relativePath(relative);
  if (noSymlinks) await safePath(root, relative, { write: true });
  return { path: relative, sha256: digest(await readFile(root, relative)) };
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(`${label}: JSON non valido.`); }
}

export function validateWorkflow(definition, { roles, adapters } = {}) {
  if (!validateDefinition(definition)) fail('Definizione workflow non conforme allo schema v1.');
  const byId = new Map();
  for (const step of definition.steps) {
    if (byId.has(step.id)) fail(`Step duplicato: ${step.id}.`);
    if (roles && !roles.includes(step.role)) fail(`Ruolo non presente nel catalogo: ${step.role}.`);
    if (adapters !== undefined && step.adapter !== null) {
      const matches = adapters.filter(entry => entry.client === 'vscode' && entry.id === step.adapter);
      if (matches.length !== 1 || matches[0].role !== step.role) {
        fail(`Adattatore ${step.adapter} assente, ambiguo o incoerente con il ruolo ${step.role} dello step ${step.id}.`);
      }
    }
    if (step.role === 'independent-reviewer' && step.write_scope.length) fail('Il revisore indipendente richiede write_scope vuoto.');
    for (const scope of step.write_scope) {
      const expanded = scope.replaceAll('{task_id}', 'task-id');
      if (/[{}]/.test(expanded) || !scope.endsWith('/')) fail('Lo scope deve indicare directory relative; è ammesso soltanto {task_id}.');
      relativePath(expanded, { directory: true });
    }
    byId.set(step.id, step);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail('Il workflow contiene un ciclo.');
    if (visited.has(id)) return;
    const step = byId.get(id);
    if (!step) fail(`Dipendenza inesistente: ${id}.`);
    visiting.add(id);
    for (const dep of step.depends_on) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return definition;
}

export async function loadWorkflow({ hubRoot = HUB_ROOT, file = DEFAULT_WORKFLOW } = {}) {
  const root = await rootDirectory(hubRoot);
  relativePath(file);
  if (!file.startsWith('workflows/') || !file.endsWith('.json')) fail('La definizione deve essere un file JSON dentro workflows/.');
  const actualFile = await fs.realpath(await safePath(root, file));
  if (!inside(path.join(root, 'workflows'), actualFile)) fail('La definizione esce da workflows/ tramite symlink.');
  const bytes = await readFile(root, file);
  const catalog = parseJson(await readFile(root, 'hub.json'), 'Catalogo hub');
  if (!Array.isArray(catalog.roles)) fail('Catalogo dei ruoli non valido.');
  // Catalogs predating adapters keep their v1 behavior; an explicit catalog
  // must identify the same destination role as each non-null workflow adapter.
  if (catalog.adapters !== undefined) await validateAgentAdapters({ root, adapters: catalog.adapters, roles: catalog.roles });
  const definition = validateWorkflow(parseJson(bytes, 'Workflow'), {
    roles: catalog.roles.map(role => role.id), adapters: catalog.adapters,
  });
  return { definition, sha256: digest(bytes), file, bytes };
}

function paths(taskId) {
  if (!validId(taskId)) fail('--task-id deve essere un identificatore valido.');
  const base = `tasks/${taskId}`;
  return { base, state: `${base}/workflow.json`, lock: `${base}/.workflow.lock`, definition: `${base}/workflow-inputs/definition.json`, brief: `${base}/workflow-inputs/brief.source` };
}

async function put(root, relative, bytes, { exclusive = false } = {}) {
  const filename = await safePath(root, relative, { write: true, missing: true });
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await safePath(root, relative, { write: true, missing: true });
  if (exclusive) { await fs.writeFile(filename, bytes, { flag: 'wx', mode: 0o600 }); return; }
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function lockRun(root, locations, operation) {
  const lock = await safePath(root, locations.lock, { write: true, missing: true });
  await fs.mkdir(path.dirname(lock), { recursive: true });
  let handle;
  try { handle = await fs.open(lock, 'wx', 0o600); }
  catch { fail('Workflow occupato o lock non accessibile. Un solo coordinatore può aggiornare lo stato.'); }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, created_at: now() })); return await operation(); }
  finally { await handle.close(); await fs.rm(lock, { force: true }); }
}

const emptyStep = () => ({ status: 'pending', attempt: 0, executor: null, mode: null, inputs: [], resume_inputs: null, report: null, evidence: [], reason: null, started_at: null, finished_at: null, history: [] });
const emptyControls = (reviewAfter = []) => ({ review_after: [...reviewAfter], paused: false, pause_reason: null, acceptances: {}, history: [] });
const scopeFor = (definition, taskId) => definition.write_scope.map(scope => scope.replaceAll('{task_id}', taskId));
const withinScope = (relative, scope) => scope.some(prefix => relative.startsWith(prefix));

function reviewStages(value, definition) {
  if (!Array.isArray(value) || new Set(value).size !== value.length || value.some(id => !definition.steps.some(step => step.id === id))) fail('Checkpoint umano duplicato o step non presente nel workflow.');
  return value;
}

function checkControls(state, definition) {
  // Runs created before human controls remain autonomous until explicitly paused.
  if (state.controls === undefined) state.controls = emptyControls();
  const controls = state.controls;
  if (!object(controls) || typeof controls.paused !== 'boolean' || !object(controls.acceptances) || !Array.isArray(controls.history) ||
      (controls.paused ? !isText(controls.pause_reason) : controls.pause_reason !== null)) fail('Controlli umani del workflow non validi.');
  reviewStages(controls.review_after, definition);
  for (const [id, acceptance] of Object.entries(controls.acceptances)) {
    if (!definition.steps.some(step => step.id === id) || !object(acceptance) || !object(acceptance.delivery) ||
        !Array.isArray(acceptance.delivery.evidence) || !acceptance.delivery.evidence.length || !isText(acceptance.recorded_at)) fail('Approvazione registrata non valida.');
    for (const file of [acceptance.decision, acceptance.delivery.report, ...acceptance.delivery.evidence]) {
      if (!object(file) || !HASH.test(file.sha256)) fail('Snapshot dell’approvazione non valido.');
      relativePath(file.path);
    }
  }
}

function checkRecord(item) {
  if (!object(item) || !STATES.includes(item.status) || !Number.isInteger(item.attempt) || item.attempt < 0 ||
      !Array.isArray(item.inputs) || !Array.isArray(item.evidence) || !Array.isArray(item.history)) fail('Stato dello step non valido.');
  if (item.resume_inputs != null && (!Array.isArray(item.resume_inputs) ||
      item.resume_inputs.map(file => file?.path).join('\0') !== item.inputs.map(file => file?.path).join('\0'))) fail('Checkpoint di ripresa non coerente con gli input.');
  for (const file of [...item.inputs, ...(item.resume_inputs ?? []), ...item.evidence, ...(item.report ? [item.report] : [])]) {
    if (!object(file) || !HASH.test(file.sha256)) fail('Riferimento allo snapshot non valido.');
    relativePath(file.path);
  }
  if (['running', 'completed'].includes(item.status) && (!isText(item.executor) || !MODES.includes(item.mode) || !item.attempt || !isText(item.started_at))) fail('Step eseguito senza identità, modalità o inizio verificabile.');
  if (item.status === 'completed' && (!item.report || !item.evidence.length || !isText(item.finished_at))) fail('Step completato senza rapporto ed evidenze.');
}

async function readRun(root, locations, taskId) {
  const state = parseJson(await readFile(root, locations.state), 'Stato workflow');
  if (state.schema_version !== 1 || state.kind !== 'workflow-run' || state.task_id !== taskId || !object(state.steps) ||
      !Number.isInteger(state.revision) || state.revision < 0 || !object(state.brief) || !object(state.workflow)) fail('Stato workflow non valido.');
  if (state.brief.copy !== locations.brief || state.workflow.copy !== locations.definition ||
      !HASH.test(state.brief.sha256) || !HASH.test(state.workflow.sha256)) fail('Snapshot workflow non valido.');
  relativePath(state.brief.path); relativePath(state.workflow.file);
  const definitionBytes = await readFile(root, locations.definition);
  if (digest(definitionBytes) !== state.workflow.sha256 || digest(await readFile(root, locations.brief)) !== state.brief.sha256) fail('Le copie degli input del workflow sono state modificate.');
  const definition = validateWorkflow(parseJson(definitionBytes, 'Snapshot workflow'));
  if (state.workflow.id !== definition.id || Object.keys(state.steps).sort().join(',') !== definition.steps.map(step => step.id).sort().join(',')) fail('Step dello stato incoerenti con il workflow.');
  for (const step of definition.steps) {
    checkRecord(state.steps[step.id]);
    if (['running', 'completed'].includes(state.steps[step.id].status) && step.depends_on.some(dep => state.steps[dep].status !== 'completed')) fail('Stato incoerente: dipendenza non completata.');
  }
  checkControls(state, definition);
  return { state, definition };
}

async function changedFiles(root, records, options = {}) {
  const changed = [];
  const unique = new Map(records.map(record => [`${record.path}:${record.sha256}`, record]));
  for (const record of unique.values()) {
    try { if ((await artifact(root, record.path, options)).sha256 !== record.sha256) changed.push({ path: record.path, reason: 'changed' }); }
    catch { changed.push({ path: record.path, reason: 'missing-or-inaccessible' }); }
  }
  return changed;
}

const deliveryRecords = record => [record.report, ...record.evidence];
const sameRecords = (a, b) => a.length === b.length && a.every((file, index) => file?.path === b[index]?.path && file?.sha256 === b[index]?.sha256);
const acceptanceFor = (state, id) => Object.hasOwn(state.controls.acceptances, id) ? state.controls.acceptances[id] : undefined;

function ancestorIds(definition, id) {
  const ancestors = new Set();
  const visit = current => {
    for (const dep of definition.steps.find(step => step.id === current).depends_on) if (!ancestors.has(dep)) { ancestors.add(dep); visit(dep); }
  };
  visit(id);
  return ancestors;
}

async function trackedEvidenceChange(root, state, definition, origin, file) {
  let current;
  try { current = await artifact(root, file.path, { noSymlinks: true }); } catch { return false; }
  // Follow only actual handoffs of this path/hash. Scope alone is not provenance.
  const tracked = new Map([[origin, file.sha256]]);
  const ancestry = new Map(definition.steps.map(step => [step.id, ancestorIds(definition, step.id)]));
  for (let progress = true; progress;) {
    progress = false;
    for (const step of definition.steps) {
      if (tracked.has(step.id) || !ancestry.get(step.id).has(origin)) continue;
      const record = state.steps[step.id], input = record.inputs.find(input => input.path === file.path);
      const attempt = record.status === 'pending' ? record.history.at(-1) : record;
      if (!input || !attempt?.attempt || !isText(attempt.executor) || !isText(attempt.started_at) ||
          !step.depends_on.some(dep => tracked.get(dep) === input.sha256)) continue;
      const writable = withinScope(file.path, scopeFor(step, state.task_id));
      let next;
      if (record.status === 'completed') {
        const delivered = record.evidence.find(item => item.path === file.path);
        if (!delivered || (!writable && delivered.sha256 !== input.sha256) ||
            (await changedFiles(root, [record.report], { noSymlinks: true })).length) continue;
        next = delivered.sha256;
      } else if (writable) {
        next = record.status === 'running' ? current.sha256 : record.resume_inputs?.find(item => item.path === file.path)?.sha256;
      }
      if (next) { tracked.set(step.id, next); progress = true; }
    }
  }
  // A later tracked delivery supersedes an earlier one; rollback is still drift.
  return [...tracked].some(([id, hash]) => id !== origin && hash === current.sha256 &&
    ![...tracked.keys()].some(other => other !== id && ancestry.get(other).has(id)));
}

async function controlsStatus(root, state, definition) {
  const approvals = [];
  for (const id of new Set([...state.controls.review_after, ...Object.keys(state.controls.acceptances)])) {
    const acceptance = acceptanceFor(state, id), record = state.steps[id];
    if (!acceptance) {
      approvals.push({ step_id: id, status: record.status === 'completed' ? 'awaiting-approval' : 'not-ready', changes: [], delivery_changes: [] });
      continue;
    }
    const changes = await changedFiles(root, [acceptance.decision, acceptance.delivery.report], { noSymlinks: true });
    const acceptedFiles = deliveryRecords(acceptance.delivery);
    if (record.status !== 'completed' || !sameRecords(acceptedFiles, deliveryRecords(record))) changes.push({ step_id: id, reason: 'delivery-record-changed' });
    const evidenceChanges = await changedFiles(root, acceptance.delivery.evidence, { noSymlinks: true });
    for (const change of evidenceChanges) {
      const file = acceptance.delivery.evidence.find(item => item.path === change.path);
      if (change.reason !== 'changed' || !await trackedEvidenceChange(root, state, definition, id, file)) changes.push(change);
    }
    approvals.push({ step_id: id, status: changes.length ? 'invalid' : 'accepted', decision: acceptance.decision, recorded_at: acceptance.recorded_at,
      changes, delivery_changes: await changedFiles(root, acceptedFiles, { noSymlinks: true }) });
  }
  return { ...state.controls, approvals, approval_note: 'Il coordinatore registra una decisione umana effettiva; la CLI non autentica chi l’ha espressa.' };
}

function approvalBlockers(state, definition, step, controls) {
  const ancestors = ancestorIds(definition, step.id);
  return controls.approvals.filter(approval => ancestors.has(approval.step_id) &&
    (state.controls.review_after.includes(approval.step_id) || acceptanceFor(state, approval.step_id)) && approval.status !== 'accepted').map(approval => approval.step_id);
}

async function baseChanges(root, state, hubRoot) {
  const changes = await changedFiles(root, [{ path: state.brief.path, sha256: state.brief.sha256 }]);
  try {
    const source = await artifact(await rootDirectory(hubRoot), state.workflow.file);
    if (source.sha256 !== state.workflow.sha256) changes.push({ path: `hub:${state.workflow.file}`, reason: 'changed' });
  } catch { changes.push({ path: `hub:${state.workflow.file}`, reason: 'missing-or-inaccessible' }); }
  return changes;
}

function definitionStep(definition, id) {
  const step = definition.steps.find(item => item.id === id);
  if (!step) fail('Step non presente nel workflow.');
  return step;
}

function inputsFor(state, step) {
  const inputs = [
    { path: state.brief.copy, sha256: state.brief.sha256 },
    { path: state.workflow.copy, sha256: state.workflow.sha256 },
  ];
  for (const dependency of step.depends_on) {
    const result = state.steps[dependency];
    if (result.status !== 'completed') fail(`Dipendenza non completata: ${dependency}.`);
    inputs.push(result.report, ...result.evidence);
  }
  return [...new Map(inputs.map(input => [input.path, input])).values()];
}

async function assertInputs(root, state, inputs, hubRoot, permitted = []) {
  const changes = await changedFiles(root, inputs);
  const forbidden = [...await baseChanges(root, state, hubRoot),
    ...changes.filter(change => change.reason !== 'changed' || !withinScope(change.path, permitted))];
  if (forbidden.length) fail(`Input modificati o mancanti: ${forbidden.map(change => change.path).join(', ')}. Ripristinare gli input o iniziare un nuovo task.`);
  return changes;
}

async function currentInputs(root, inputs, scope, { blocking = false } = {}) {
  return Promise.all(inputs.map(async input => {
    if (!withinScope(input.path, scope)) return input;
    try { return await artifact(root, input.path, { noSymlinks: true }); }
    catch (error) {
      // A failure must still be recordable. An unreadable input keeps its old
      // hash, so retry requires its restoration instead of accepting its loss.
      if (blocking) return input;
      throw error;
    }
  }));
}

function delivery(root, state, step, inputs, hubRoot, current, changes, controls, blockers) {
  const record = state.steps[step.id];
  return {
    schema_version: 1, kind: 'workflow-handoff', task_id: state.task_id, workflow_id: state.workflow.id,
    step_id: step.id, project_root: root, hub_root: path.resolve(hubRoot), from_role: 'coordinator', to_role: step.role,
    adapter: step.adapter, objective: step.objective, inputs, current_inputs: current, input_changes: changes, write_scope: scopeFor(step, state.task_id),
    executor: record.executor, mode: record.mode, attempt: record.attempt,
    controls, human_review_required: state.controls.review_after.includes(step.id),
    scheduling: { paused: controls.paused, approval_blockers: blockers, can_start: record.status === 'pending' && !controls.paused && !blockers.length },
    report_instruction: step.write_scope.length ? 'Restituire rapporto, evidenze esistenti e limiti al coordinatore.' : 'Non scrivere file: restituire il rapporto al coordinatore, che lo salva e registra le evidenze.',
    delegation: 'Il coordinatore deve usare gli strumenti del runtime; questo comando non crea agenti.',
  };
}

async function statusOf(root, state, definition, hubRoot) {
  const controls = await controlsStatus(root, state, definition);
  const steps = definition.steps.map(step => ({
    id: step.id, role: step.role, adapter: step.adapter, ...state.steps[step.id],
    ready: state.steps[step.id].status === 'pending' && !controls.paused && !approvalBlockers(state, definition, step, controls).length && step.depends_on.every(dep => state.steps[dep].status === 'completed'),
    approval_blockers: approvalBlockers(state, definition, step, controls), human_review_required: state.controls.review_after.includes(step.id),
    depends_on: step.depends_on, write_scope: scopeFor(step, state.task_id),
  }));
  const awaiting = controls.approvals.filter(approval => state.controls.review_after.includes(approval.step_id) && state.steps[approval.step_id].status === 'completed' && approval.status !== 'accepted').map(approval => approval.step_id);
  const status = controls.paused ? 'paused'
    : steps.every(step => step.status === 'completed') ? (awaiting.length || controls.approvals.some(approval => approval.status === 'invalid') ? 'awaiting-approval' : 'completed')
    : steps.some(step => ['failed', 'blocked'].includes(step.status)) ? 'blocked'
      : steps.some(step => step.status === 'running') ? 'running' : awaiting.length ? 'awaiting-approval' : 'pending';
  const records = steps.flatMap(step => [step, ...step.history].flatMap(attempt =>
    [...attempt.inputs, ...(attempt.resume_inputs ?? []), ...(attempt.report ? [attempt.report] : []), ...attempt.evidence]));
  const frontier = definition.steps.filter(step => state.steps[step.id].status === 'running' ||
    (state.steps[step.id].status === 'pending' && step.depends_on.every(dep => state.steps[dep].status === 'completed')));
  const activeRecords = frontier.flatMap(step => {
    const record = state.steps[step.id];
    return record.resume_inputs ?? (record.inputs.length ? record.inputs : inputsFor(state, step));
  });
  if (!frontier.length) {
    // At completion, the final review snapshot is current; earlier hashes may
    // describe files intentionally changed and re-hashed during integration.
    const finalSteps = definition.steps.filter(step => !definition.steps.some(other => other.depends_on.includes(step.id)) && state.steps[step.id].status === 'completed');
    for (const step of finalSteps) activeRecords.push(...state.steps[step.id].inputs, state.steps[step.id].report, ...state.steps[step.id].evidence);
  }
  const base = await baseChanges(root, state, hubRoot);
  return {
    task_id: state.task_id, workflow_id: state.workflow.id, project_root: root, revision: state.revision, status, controls, awaiting_approval: awaiting,
    modes: [...new Set(steps.map(step => step.mode).filter(Boolean))],
    verification_note: 'Le modalità e gli esiti sono dichiarati dal coordinatore; proof/dry-run non attestano esecuzione Unity. Gli hash provano i file, non la verità dei rapporti.',
    input_changes: [...base, ...await changedFiles(root, activeRecords)],
    historical_input_changes: await changedFiles(root, records), steps,
  };
}

export async function initWorkflow({ projectRoot, taskId, brief, reviewAfter = [], hubRoot = HUB_ROOT, file = DEFAULT_WORKFLOW } = {}) {
  const root = await rootDirectory(projectRoot), locations = paths(taskId);
  const hub = await rootDirectory(hubRoot);
  if (root === hub) fail('Il workflow di gioco richiede un progetto distinto dal hub.');
  relativePath(brief);
  const briefBytes = await readFile(root, brief), workflow = await loadWorkflow({ hubRoot: hub, file });
  reviewStages(reviewAfter, workflow.definition);
  return lockRun(root, locations, async () => {
    try { await fs.lstat(await safePath(root, locations.state, { missing: true })); fail('Workflow già esistente: non viene sovrascritto. Usare status o un altro task-id.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const created = [];
    try {
      await put(root, locations.definition, workflow.bytes, { exclusive: true }); created.push(locations.definition);
      await put(root, locations.brief, briefBytes, { exclusive: true }); created.push(locations.brief);
      const state = {
        schema_version: 1, kind: 'workflow-run', task_id: taskId, revision: 0, created_at: now(), updated_at: now(),
        workflow: { id: workflow.definition.id, file, copy: locations.definition, sha256: workflow.sha256 },
        brief: { path: brief, copy: locations.brief, sha256: digest(briefBytes) },
        controls: emptyControls(reviewAfter),
        steps: Object.fromEntries(workflow.definition.steps.map(step => [step.id, emptyStep()])),
      };
      await put(root, locations.state, `${JSON.stringify(state, null, 2)}\n`, { exclusive: true });
      return statusOf(root, state, workflow.definition, hub);
    } catch (error) {
      for (const relative of created) await fs.rm(path.join(root, relative), { force: true });
      if (error.code === 'EEXIST') fail('File di workflow già presenti: nessuna sovrascrittura consentita.');
      throw error;
    }
  });
}

export async function runWorkflow({ command, projectRoot, taskId, step: stepId, executor, mode, report, evidence = [], reason, failed = false, decision, reviewAfter = [], hubRoot = HUB_ROOT, ...extra } = {}) {
  if (command === 'init') return initWorkflow({ projectRoot, taskId, hubRoot, reviewAfter, ...extra });
  if (!['status', 'start', 'finish', 'block', 'retry', 'handoff', 'accept', 'pause', 'resume'].includes(command)) fail('Comando workflow non riconosciuto.');
  if (!Array.isArray(reviewAfter) || reviewAfter.length) fail('--review-after è disponibile soltanto per init.');
  const root = await rootDirectory(projectRoot), locations = paths(taskId);
  const operation = async () => {
    const { state, definition } = await readRun(root, locations, taskId);
    if (command === 'status') return statusOf(root, state, definition, hubRoot);
    const runControl = ['pause', 'resume'].includes(command);
    const step = runControl ? null : definitionStep(definition, stepId), record = step && state.steps[step.id];
    let result;
    if (runControl) {
      if (stepId !== undefined) fail('Pausa e ripresa riguardano la run, senza --step.');
      if (!isText(reason)) fail('--reason è obbligatorio.');
      const paused = command === 'pause';
      if (state.controls.paused === paused) fail(paused ? 'Workflow già in pausa.' : 'Workflow non in pausa.');
      Object.assign(state.controls, { paused, pause_reason: paused ? reason : null });
      state.controls.history.push({ action: command, reason, recorded_at: now() });
    } else if (command === 'accept') {
      if (record.status !== 'completed') fail('Approvazione consentita soltanto dopo il completamento della fase.');
      if (acceptanceFor(state, step.id)) fail('Approvazione già registrata: non viene riscritta. Ripristinare i file o aprire un task correttivo collegato.');
      relativePath(decision);
      if (Object.values(state.steps).some(item => [...item.inputs, ...(item.report ? [item.report] : []), ...item.evidence].some(file => file.path === decision)) || decision === state.brief.path) fail('La decisione deve essere un file distinto da input, rapporti ed evidenze.');
      await assertInputs(root, state, deliveryRecords(record), hubRoot);
      await safePath(root, decision, { write: true });
      const bytes = await readFile(root, decision), human = parseJson(bytes, 'Decisione umana');
      if (!object(human) || human.task_id !== taskId || human.step_id !== step.id || human.decision !== 'accept' || !isText(human.user_statement) || !isText(human.source)) fail('Decisione umana non valida: servono task_id, step_id, decision accept, user_statement e source non vuoti.');
      state.controls.acceptances[step.id] = { decision: { path: decision, sha256: digest(bytes) },
        delivery: structuredClone({ report: record.report, evidence: record.evidence }), recorded_at: now() };
    } else if (command === 'start' || command === 'handoff') {
      if (command === 'start' && record.status !== 'pending') fail('Solo uno step pending può essere avviato.');
      if (command === 'handoff' && !['pending', 'running'].includes(record.status)) fail('Handoff disponibile solo per step pending o running.');
      const dependencyInputs = inputsFor(state, step);
      const inputs = record.inputs.length ? record.inputs : dependencyInputs;
      const running = record.status === 'running';
      const expected = running ? inputs : record.resume_inputs ?? inputs;
      const changes = await assertInputs(root, state, expected, hubRoot, running ? scopeFor(step, taskId) : []);
      const current = running ? await currentInputs(root, inputs, scopeFor(step, taskId)) : expected;
      const controls = await controlsStatus(root, state, definition), blockers = approvalBlockers(state, definition, step, controls);
      if (command === 'start') {
        if (controls.paused) fail('Workflow in pausa: resume è necessario prima di nuovi start. I worker attivi non sono interrotti dalla CLI.');
        if (blockers.length) fail(`Approvazione umana mancante o alterata per: ${blockers.join(', ')}.`);
        if (!isText(executor) || executor.length > 256) fail('--executor richiede l’identificativo reale comunicato dal runtime.');
        if (!MODES.includes(mode)) fail('--mode deve essere production, proof o dry-run.');
        if (mode === 'production' && step.depends_on.some(dep => state.steps[dep].mode !== 'production')) fail('Uno step production non può usare dipendenze proof o dry-run.');
        const scope = scopeFor(step, taskId);
        for (const directory of scope) await safePath(root, relativePath(directory, { directory: true }), { write: true, missing: true });
        for (const other of definition.steps.filter(item => state.steps[item.id].status === 'running')) {
          if (scope.some(a => scopeFor(other, taskId).some(b => a.startsWith(b) || b.startsWith(a)))) fail(`Scope in conflitto con lo step running ${other.id}.`);
        }
        Object.assign(record, { status: 'running', attempt: record.attempt + 1, executor, mode, inputs, reason: null, started_at: now(), finished_at: null });
      }
      result = delivery(root, state, step, inputs, hubRoot, current,
        running ? changes : inputs.filter(input => current.find(file => file.path === input.path)?.sha256 !== input.sha256).map(input => ({ path: input.path, reason: 'changed' })), controls, blockers);
      if (command === 'handoff') return result;
    } else if (command === 'finish') {
      if (record.status !== 'running') fail('Solo uno step running può essere completato.');
      if (!report || !Array.isArray(evidence) || !evidence.length) fail('Finish richiede --report e almeno una --evidence esistenti.');
      if (evidence.includes(report) || new Set(evidence).size !== evidence.length) fail('Rapporto ed evidenze devono essere file distinti.');
      const reportScope = `${locations.base}/${step.id}/`;
      relativePath(report);
      if (!report.startsWith(reportScope)) fail(`Il rapporto deve stare in ${reportScope}.`);
      const permittedEvidence = [...scopeFor(step, taskId), reportScope];
      for (const file of evidence) {
        relativePath(file);
        if (!withinScope(file, permittedEvidence) && !record.inputs.some(input => input.path === file) && file !== state.brief.path) fail('Evidenza fuori dallo scope della fase e dagli input consegnati.');
      }
      const changed = await assertInputs(root, state, record.inputs, hubRoot, scopeFor(step, taskId));
      const reportFile = await artifact(root, report, { noSymlinks: true }), evidenceFiles = await Promise.all(evidence.map(file => artifact(root, file, { noSymlinks: true })));
      if (changed.some(change => !evidenceFiles.some(file => file.path === change.path))) fail('Le modifiche agli input nello scope devono comparire nelle evidenze finali.');
      Object.assign(record, { status: 'completed', report: reportFile, evidence: evidenceFiles, finished_at: now(), reason: null });
    } else if (command === 'block') {
      if (!['pending', 'running'].includes(record.status)) fail('Si può bloccare soltanto uno step pending o running.');
      if (!isText(reason)) fail('--reason è obbligatorio.');
      if (record.status === 'running') record.resume_inputs = await currentInputs(root, record.resume_inputs ?? record.inputs, scopeFor(step, taskId), { blocking: true });
      Object.assign(record, { status: failed ? 'failed' : 'blocked', reason, finished_at: now() });
    } else if (command === 'retry') {
      if (!['blocked', 'failed'].includes(record.status)) fail('Retry consentito solo per step blocked o failed.');
      if (!isText(reason)) fail('--reason è obbligatorio.');
      const descendants = new Set([step.id]);
      for (let changed = true; changed;) {
        changed = false;
        for (const candidate of definition.steps) if (!descendants.has(candidate.id) && candidate.depends_on.some(dep => descendants.has(dep))) { descendants.add(candidate.id); changed = true; }
      }
      if ([...descendants].some(id => id !== step.id && ['running', 'completed'].includes(state.steps[id].status))) fail('Retry vietato: un dipendente è già running o completed.');
      if (record.inputs.length) await assertInputs(root, state, record.resume_inputs ?? record.inputs, hubRoot);
      const previous = structuredClone(record); delete previous.history;
      const history = [...record.history, { ...previous, retry_reason: reason, retried_at: now() }];
      Object.assign(record, emptyStep(), { attempt: previous.attempt, inputs: previous.inputs, resume_inputs: previous.resume_inputs ?? null, history });
    }
    state.revision++; state.updated_at = now();
    await put(root, locations.state, `${JSON.stringify(state, null, 2)}\n`);
    return result ?? statusOf(root, state, definition, hubRoot);
  };
  return ['status', 'handoff'].includes(command) ? operation() : lockRun(root, locations, operation);
}

export function parseArgs(args) {
  const [command, ...rest] = args;
  if (command === '--help' || command === '-h' || !command) return { help: true };
  const options = { command, evidence: [] }, seen = new Set();
  const commandFlags = {
    init: ['--brief', '--workflow', '--review-after'], status: [], start: ['--step', '--executor', '--mode'],
    finish: ['--step', '--report', '--evidence'], block: ['--step', '--reason', '--failed'], retry: ['--step', '--reason'],
    handoff: ['--step'], accept: ['--step', '--decision'], pause: ['--reason'], resume: ['--reason'],
  };
  if (!Object.hasOwn(commandFlags, command)) fail('Comando workflow non riconosciuto.');
  const allowed = new Set(['--project-root', '--task-id', ...commandFlags[command]]);
  const names = { '--project-root': 'projectRoot', '--task-id': 'taskId', '--brief': 'brief', '--step': 'step', '--executor': 'executor', '--mode': 'mode', '--report': 'report', '--reason': 'reason', '--workflow': 'file', '--decision': 'decision' };
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (!allowed.has(arg)) fail('Opzione workflow non riconosciuta o non ammessa per questo comando.');
    if (arg === '--failed') { if (seen.has(arg)) fail('Opzione ripetuta.'); seen.add(arg); options.failed = true; continue; }
    const value = rest[++index];
    if (!value || value.startsWith('--')) fail('Valore mancante per un’opzione workflow.');
    if (arg === '--evidence') options.evidence.push(value);
    else if (arg === '--review-after') (options.reviewAfter ??= []).push(value);
    else { if (seen.has(arg)) fail('Opzione ripetuta.'); seen.add(arg); options[names[arg]] = value; }
  }
  return options;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log('Uso: node scripts/workflow.mjs init|status|start|finish|block|retry|handoff|accept|pause|resume --project-root ABS --task-id ID [opzioni]');
      console.log('init --brief REL [--review-after STEP ripetibile]; start --step ID --executor ID --mode production|proof|dry-run; finish --step ID --report REL --evidence REL; block/retry --step ID --reason TESTO; accept --step ID --decision REL; pause/resume --reason TESTO');
      return 0;
    }
    console.log(JSON.stringify(await runWorkflow(options), null, 2));
    return 0;
  } catch (error) { console.error(`ERRORE: ${error.message}`); return 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
