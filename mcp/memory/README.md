# games-memory v1

Memoria condivisa basata su note Markdown e un indice locale SQLite FTS5.
Il codice è distribuito insieme al hub. Richiede Node `22.23.2` o successivo;
`mise.toml` fissa la versione usata dal progetto. Si usa `node:sqlite`, senza
addon da compilare: su Node 22 l'API emette un avviso sperimentale su stderr.

## Preparazione da un nuovo checkout

Installare mise, clonare il hub, entrare nella sua directory ed esaminare la
configurazione prima di accordarle fiducia:

```sh
mise trust
mise install
mise run hub:setup
mise run memory:index
mise run memory:status
mise run memory:search -- --query "memoria"
```

`hub:setup` esegue `npm ci` dal lockfile, senza lifecycle script, e genera
tre frammenti di configurazione in `.games/local/` dalla voce `games-memory`
di `hub.json.mcp_servers`. `hub:sync` usa la stessa sorgente senza installare
dipendenze. Il setup parte anche
senza `node_modules` e non richiede chiavi API. Le dipendenze richiedono rete
al primo download; il server avviato non installa pacchetti, non reindicizza
e non usa un servizio remoto. `.env` serve soltanto alle integrazioni opzionali.

Per registrare il server nel workspace VS Code del hub:

```sh
mise run hub:sync -- --client vscode --apply
```

L'adattatore usa `${workspaceFolder}` per risolvere questo checkout. Il
generatore aggiunge soltanto `games-memory`, preserva gli altri server e
rifiuta di sovrascrivere un'entry differente non gestita. Le configurazioni
generate sono dati locali; il setup non azzera note, indici o login.
La directory `.games/local/` riceve un proprio `.gitignore`, così i
frammenti rimangono esclusi anche nei checkout esterni. Eventuali file
già tracciati da Git richiedono una gestione esplicita prima di rigenerarli.

Gli adattatori Claude e Codex si generano con `--client claude` e
`--client codex`. Usano percorsi assoluti locali perché non assumono
l'espansione delle variabili VS Code. Per applicarli con `--apply`, il file
di destinazione deve essere ignorato da Git e non già tracciato; la verifica
richiede Git. Senza `--apply` i frammenti restano consultabili in
`.games/local/`. Il generatore rifiuta una doppia registrazione di
`games-memory` in `.mcp.json` e `.vscode/mcp.json` dello stesso checkout.

Installazione, registrazione e uso sono verifiche distinte. Il client può
richiedere fiducia nel server o il riavvio della sessione per aggiornare gli
strumenti. Gli account dei modelli restano gestiti da ciascun utente.

## Catalogo e adattatori

`hub.json.mcp_servers` è la fonte della definizione di `games-memory`.
Per cambiare entrypoint, argomenti o ambiente si modifica il catalogo e si
esegue `hub:sync`; questi dati non sono duplicati nel generatore. La voce
attuale è:

```json
{
  "id": "games-memory",
  "transport": "stdio",
  "runtime": "node",
  "entrypoint": "mcp/memory/server.mjs",
  "args": ["--hub-root", { "root": "hub" }],
  "project_args": ["--project-root", { "root": "project" }],
  "env": { "MISE_AUTO_INSTALL": "false" }
}
```

Lo schema v1 supporta server stdio eseguiti con Node e un entrypoint locale
JavaScript dentro `mcp/`. Gli argomenti possono essere stringhe portabili o
riferimenti strutturati alla root. `args` ammette `{ "root": "hub" }`;
`project_args`, opzionale, ammette anche `{ "root": "project" }` ed è usato
soltanto quando viene selezionato un checkout di progetto. `env` contiene
valori espliciti non segreti; credenziali e percorsi macchina non appartengono
al catalogo.

Il generatore valida la sezione MCP e i suoi entrypoint prima di scrivere
configurazioni. Una voce `games-memory` assente o non valida interrompe
l'operazione. Preview e applicazione usano la stessa lettura del catalogo.
Gli adattatori risolvono le root per il client scelto e avviano il server con
`mise exec --no-deps` e `MISE_AUTO_INSTALL=false`, separando l'avvio dal setup.

Questa milestone distribuisce soltanto `games-memory`. Gli altri MCP già
presenti nei client vengono preservati: non sono stati migrati al catalogo
né verificati da questa generazione.

## Aggiungere una memoria

Ogni root ha un manifest `memory/sources.json`:

```json
{
  "schema_version": 1,
  "documents": ["memory/decision.md"]
}
```

Sono indicizzate soltanto le note elencate, senza scansioni ricorsive di
`projects/`. Una nota richiede il frontmatter seguente:

```markdown
---
id: movement-timestep
title: Passo della simulazione
scope: project
status: verified
updated: 2026-09-21
author: Nome del responsabile
sources:
  - docs/simulation.md
---

Descrizione della decisione, contesto e limiti. La fonte resta autorevole.
```

`scope` è `hub` nelle note comuni, `project` o `task` nelle note del gioco.
`status` è `proposed`, `verified` o `superseded`; la data è `YYYY-MM-DD`.
Ogni fonte deve esistere nello stesso checkout. Il server restituisce anche
gli hash delle note e delle fonti. Non inserire segreti nei documenti
indicizzati. I template iniziali sono in `templates/memory/`.

Dopo una modifica, il responsabile rilegge la nota e le fonti, corregge
eventuali affermazioni superate e aggiorna l'indice. `ready` significa che
l'indice corrisponde ai file correnti: non certifica la verità del testo e
non trasforma una proposta in decisione verificata. Lo stato editoriale
della nota viene mantenuto esplicitamente da chi la modifica.

```sh
mise run memory:index
mise run memory:read -- --scope hub --path memory/decisions/memory-model.md
```

## Progetti e worktree esterni

Copiare il manifest vuoto di `templates/memory/sources.json` nel progetto,
aggiungere note e inserire `.games/cache/` e `.games/local/` nel suo
`.gitignore`. I progetti hanno un indice distinto dal hub; una root deve
essere selezionata esplicitamente:

```sh
mise run memory:index -- --project-root "/percorso/al gioco"
mise run memory:search -- --project-root "/percorso/al gioco" --scope project --query "movimento"
mise run hub:sync -- --client vscode --project-root "/percorso/al gioco"
```

Il primo comando aggiorna hub e progetto; `--scope project` limita anche
l'indicizzazione al solo gioco. Il terzo prepara un adattatore locale nel
checkout selezionato. In questo caso contiene il percorso del hub e vale
la regola delle configurazioni locali ignorate da Git prima di `--apply`.
Non si presume l'eredità delle configurazioni fra repository separati.

## Strumenti MCP e validità

| Strumento | Input | Risultato |
|---|---|---|
| `memory_status` | `scope`: all/hub/project, predefinito all | Stato e motivi di invalidazione per ciascun indice |
| `memory_search` | `query`, `scope`, `limit` 1–50 | Note correnti, estratti, metadati, percorsi e hash |
| `memory_read` | `scope`: hub/project, `path` nel manifest | Nota attuale dal filesystem, anche con cache assente |

Ogni risultato ha `state`: `ready`, `missing` o `stale`. Un indice obsoleto
viene omesso dalla ricerca e indica i file da rileggere; un altro scope
ancora valido può fornire risultati. Gli errori di input sono errori MCP,
non risultati vuoti. CLI: uscita 0 per `ready`, 1 per cache assente/obsoleta
o errore, con dettagli JSON quando disponibili.

I tre strumenti sono di sola lettura e non creano file o cartelle. Solo
`memory:index` scrive `.games/cache/memory.sqlite`, con transazione e attesa
massima sul lock di cinque secondi. La v1 usa journal DELETE per evitare
che letture producano sidecar WAL/SHM. La transazione riguarda un indice;
hub e progetto vengono aggiornati separatamente.
L'indicizzatore crea anche `.games/cache/.gitignore` per escludere i dati
derivati nei nuovi checkout. Come ogni regola Git, non rimuove dall'indice
file che qualcuno abbia già aggiunto forzatamente al repository.

Le note recuperate sono dati di contesto: non sostituiscono istruzioni,
permessi o specifiche. La memoria non include automaticamente cronologie
delle chat, non sincronizza database fra macchine e non attiva hook.

## Verifiche e portabilità

`mise run hub:test` comprende test di manifest, metadati, scope, cache
obsoleta, transazioni, percorsi, adattatori e chiamate reali dei tre strumenti
MCP tramite stdio. I test usano directory temporanee con spazi e checkout
separati; non dipendono dai giochi o da credenziali.
La validazione del catalogo e le chiamate stdio non dimostrano che ogni
harness carichi il server nella propria interfaccia. Discovery e uso nei
client, autenticazione dei modelli e operazioni nell'engine richiedono
prove separate.

Il 22 settembre 2026 l'utente ha confermato una verifica funzionale minima
nell'istanza VS Code Games: stato `ready` con due documenti, ricerca di
`catalogo` con risultato `memory-model` (`verified`, aggiornato al
2026-09-22) e lettura integrale riuscita, senza terminale. L'utente riferisce
anche di vedere le chiamate agli strumenti nel debug della conversazione.
Questa evidenza deriva dal suo resoconto, non da un'ispezione autonoma dei
log: vedi [esito VS Code](../../docs/verification/mcp-catalog/vscode-result.md).
Le TUI e le operazioni nell'engine non sono verificate da questa prova.

La piattaforma verificata in questa milestone è macOS arm64. Linux e
Windows richiedono ancora esecuzioni su host reali prima di dichiarare il
supporto. Il launcher della finestra VS Code rimane specifico macOS.
