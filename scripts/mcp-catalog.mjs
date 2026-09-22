import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import hubSchema from '../schemas/hub.schema.json' with { type: 'json' };

const validate = new Ajv({ allErrors: true, strict: true }).compile({
  type: 'array', maxItems: 64,
  items: { $ref: '#/definitions/mcpServer' }, definitions: hubSchema.definitions,
});
const fail = message => { throw new Error(message); };
const within = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
function portableLiteral(value, label) {
  if (value.includes('\0') || value.includes('${') || value.startsWith('~') ||
      path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    fail(`${label}: usare valori portabili e riferimenti root espliciti, senza percorsi macchina o interpolazioni.`);
  }
}
async function rootDirectory(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) fail('Catalogo MCP: root assoluta richiesta.');
  let real;
  try { real = await fs.realpath(root); } catch { fail('Catalogo MCP: root non accessibile.'); }
  if (!(await fs.stat(real)).isDirectory()) fail('Catalogo MCP: root non valida.');
  return real;
}
async function entrypointFile(root, relative) {
  portableLiteral(relative, 'Entrypoint MCP');
  const parts = relative.split('/');
  if (relative.includes('\\') || parts.some(part => !part || part === '.' || part === '..') ||
      parts[0] !== 'mcp' || !/\.(mjs|cjs|js)$/.test(relative)) {
    fail('Entrypoint MCP: richiesto un file JavaScript relativo dentro mcp/, senza attraversamenti.');
  }
  let target;
  try { target = await fs.realpath(path.join(root, relative)); } catch { fail('Entrypoint MCP: file non accessibile.'); }
  const relativeReal = path.relative(root, target).split(path.sep).join('/');
  if (!within(root, target) || !relativeReal.startsWith('mcp/')) fail('Entrypoint MCP: symlink fuori dal componente mcp del hub.');
  if (!(await fs.stat(target)).isFile()) fail('Entrypoint MCP: il riferimento non è un file.');
}

export async function validateMcpCatalog({ root, servers }) {
  if (!validate(servers)) {
    // Do not include data values, which might contain a mistakenly supplied credential.
    const paths = [...new Set(validate.errors.map(error => error.instancePath || '/'))];
    fail(`Catalogo MCP non valido nei campi: ${paths.join(', ')}.`);
  }
  const hub = await rootDirectory(root);
  const ids = new Set();
  for (const server of servers) {
    if (ids.has(server.id)) fail(`Identificatore MCP duplicato: ${server.id}.`);
    ids.add(server.id);
    await entrypointFile(hub, server.entrypoint);
    for (const [section, args] of [['args', server.args], ['project_args', server.project_args ?? []]]) {
      for (const arg of args) {
        if (typeof arg === 'string') portableLiteral(arg, `MCP ${server.id}, ${section}`);
        else if (section === 'args' && arg.root === 'project') fail(`MCP ${server.id}: riferimenti project ammessi soltanto in project_args.`);
      }
    }
    for (const value of Object.values(server.env ?? {})) portableLiteral(value, `MCP ${server.id}, env`);
  }
  return structuredClone(servers);
}

export async function loadMcpCatalog({ root }) {
  const hub = await rootDirectory(root);
  let file;
  try { file = await fs.realpath(path.join(hub, 'hub.json')); } catch { fail('Catalogo MCP: hub.json non accessibile.'); }
  if (!within(hub, file)) fail('Catalogo MCP: hub.json esce dalla root tramite symlink.');
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(file, 'utf8')); } catch { fail('Catalogo MCP: hub.json non è JSON valido.'); }
  if (manifest?.schema_version !== 1) fail('Catalogo MCP: schema_version non supportata.');
  return validateMcpCatalog({ root: hub, servers: manifest.mcp_servers });
}

export function renderMcpEntry(definition, { hubRoot, projectRoot, client }) {
  if (!['vscode', 'claude', 'codex'].includes(client)) fail('Client MCP non supportato.');
  if (!path.isAbsolute(hubRoot) || (projectRoot && !path.isAbsolute(projectRoot))) fail('Rendering MCP: root assolute richieste.');
  if (projectRoot && path.resolve(hubRoot) === path.resolve(projectRoot)) fail('Hub e progetto devono essere checkout distinti.');
  if (!validate([definition])) fail('Rendering MCP: definizione non valida.');
  const portable = client === 'vscode' && !projectRoot;
  const hub = portable ? '${workspaceFolder}' : hubRoot;
  const resolveArg = arg => {
    if (typeof arg === 'string') return arg;
    if (arg.root === 'hub') return hub;
    if (!projectRoot) fail('Rendering MCP: riferimento project senza checkout selezionato.');
    return projectRoot;
  };
  const entry = {
    command: 'mise',
    args: ['-C', hub, 'exec', '--no-deps', '--', definition.runtime,
      portable ? definition.entrypoint : path.join(hubRoot, definition.entrypoint),
      ...definition.args.map(resolveArg), ...(projectRoot ? (definition.project_args ?? []).map(resolveArg) : [])],
    env: { ...definition.env, MISE_AUTO_INSTALL: 'false' },
  };
  return client === 'vscode' ? { type: definition.transport, ...entry } : entry;
}
