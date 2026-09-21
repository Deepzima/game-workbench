import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv from 'ajv';

const readJson = async relative => JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
const taskTemplate = await readJson('../templates/task/task.json');
const handoffTemplate = await readJson('../templates/task/handoff.json');
const validateTask = new Ajv({ strict: true, allErrors: true }).compile(await readJson('../schemas/task.schema.json'));
const validateHandoff = new Ajv({ strict: true, allErrors: true }).compile(await readJson('../schemas/handoff.schema.json'));

test('task pianificato senza verifiche valido; chiusura senza verifiche rifiutata', () => {
  const task = structuredClone(taskTemplate);
  assert.equal(validateTask(task), true);
  task.status = 'done';
  assert.equal(validateTask(task), false);
});

test('chiusura richiede controlli passati con evidenze, anche per una verifica manuale', () => {
  const task = { ...structuredClone(taskTemplate), status: 'done' };
  task.checks = [{ name: 'Review manuale dei criteri', status: 'passed', evidence: [] }];
  assert.equal(validateTask(task), false);
  task.checks[0].evidence = ['tasks/example-task/review.md'];
  assert.equal(validateTask(task), true);
  for (const status of ['failed', 'not_run']) {
    task.checks[0].status = status;
    assert.equal(validateTask(task), false, status);
  }
});

test('obiettivo e criteri vuoti non costituiscono un incarico valido', () => {
  assert.equal(validateTask({ ...taskTemplate, objective: ' \n\t' }), false);
  assert.equal(validateTask({ ...taskTemplate, acceptance: [] }), false);
});

test('handoff di sola lettura valido; versione e input restano obbligatori', () => {
  const handoff = structuredClone(handoffTemplate);
  assert.deepEqual(handoff.write_scope, []);
  assert.equal(validateHandoff(handoff), true);
  assert.equal(validateHandoff({ ...handoff, snapshot: ' ' }), false);
  assert.equal(validateHandoff({ ...handoff, inputs: [] }), false);
  delete handoff.snapshot;
  assert.equal(validateHandoff(handoff), false);
});
