# games

Hub per integrare gli harness AI nello sviluppo videoludico: dal design
all'implementazione, dalla produzione degli asset alla verifica nel gioco.
I giochi vivono in `projects/` e mantengono le proprie convenzioni.

Per harness intendiamo l'ambiente che esegue l'agente e ne gestisce contesto,
strumenti, permessi e sessione. Il modello scelto e l'interfaccia usata sono
altre parti del setup: vanno documentate insieme all'harness effettivo.

## Modalità di lavoro

L'interfaccia principale è la finestra **VS Code Agents**. Le TUI di Codex e
Claude Code sono accessi alternativi occasionali agli stessi progetti.
Il percorso già verificato per coordinatore, revisore e memoria usa Codex
nell'istanza VS Code dedicata.

Istruzioni, skills, strumenti e stato dei task devono essere accessibili
attraverso gli adattatori dei rispettivi harness. Conversazioni e sessioni
native restano gestite dal runtime che le ha create: la continuità del lavoro
si basa su brief, artefatti, memoria pertinente e checkpoint del progetto.

Claude Code rimane anche uno strumento opzionale delegabile dagli agenti, senza dover
aprire manualmente la sua TUI. Una chiamata CLI delegata restituisce il
risultato alla sessione chiamante; non implica la creazione di una nuova
sessione visibile nella lista di VS Code Agents. Anche OpenCode è un esecutore
opzionale per il codice. Se un esecutore manca, l'agente può continuare
con i propri strumenti entro l'incarico: [scelta e controllo](docs/agent-execution.md).

## Criteri di riuscita

- Un task ha un obiettivo, input identificabili, un risultato verificabile e
  un responsabile dell'integrazione.
- Gli harness lavorano su specifiche e artefatti condivisi. Le configurazioni
  specifiche di ciascuno restano esplicite; la compatibilità si verifica.
- Codice e asset vengono controllati nel contesto di destinazione: build,
  comportamento nel gioco, importazione, qualità visiva e budget pertinenti.
- Ogni integrazione riporta cosa è configurato, cosa è stato provato e cosa
  manca. Un server configurato o un modello visibile non provano il workflow.
- La complessità introdotta deve aiutare un lavoro concreto: ruoli, passaggi
  tra agenti e strumenti si aggiungono quando servono.
- Il hub sarà distribuito tramite GitHub: un nuovo checkout deve poter
  preparare strumenti e dipendenze tramite `mise`, senza dipendere dai
  percorsi, account o dati locali dell'autore. La portabilità va verificata
  sulle piattaforme dichiarate; il launcher VS Code attuale è specifico macOS.

## Organizzazione

La separazione è: capacità riutilizzabili nel hub; task, stato,
codice, asset e decisioni specifiche nei singoli giochi. La
[ricerca su ruoli, skills, MCP e delega a Claude Code](docs/harness-game-development.md)
descrive il percorso verso la v1.0 e distingue quanto implementato dalle
integrazioni ancora da verificare.

- `AGENTS.md` e `CLAUDE.md`: istruzioni di ingresso per i rispettivi harness.
- `hub.json` e `agents/`: catalogo di ruoli, adattatori, skill, contratti e
  definizioni MCP, con sette ruoli comuni indipendenti dal provider.
- `skills/`: handoff, feature, delega di codice, mock locali, guardrail e laboratori.
- `guardrails/`: moduli di istruzioni importabili nel catalogo; non sono
  permessi o controlli della sandbox.
- `.agents/skills` → `../skills`: collegamento simbolico per la discovery
  Codex, senza copie delle procedure.
- `.github/agents/games-coordinator.agent.md`: primo adattatore per il menu
  dei ruoli di VS Code, con riferimento al coordinatore comune.
- `.github/agents/games-reviewer.agent.md`: revisore indipendente, selezionabile
  o destinatario di una delega quando supportata dal runtime.
- `.github/agents/games-graphics.agent.md` e `games-programmer.agent.md`:
  destinatari dei rami grafica e gameplay, con incarichi separati.
- `.github/agents/games-designer.agent.md`, `games-architect.agent.md` e
  `games-qa.agent.md`: completano i sette adattatori dei ruoli comuni.
- `workflows/`: definizioni comuni; `scripts/workflow.mjs` registra fasi,
  dipendenze, esecutori e consegne nei task del progetto.
- `schemas/` e `templates/task/`: formati e modelli per task e handoff.
- `.claude/agents/`: ruoli specialistici attualmente definiti per Claude.
- `docs/architecture/`: decisioni e contratti condivisi, quando necessari.
- `assets/`: struttura preesistente della pipeline asset; i nuovi contenuti
  specifici di un gioco appartengono al progetto.
- `mise.toml`, `scripts/` e `.vscode/`: avvio, toolchain e integrazioni locali.
- `mcp/memory/`, `memory/`: servizio memoria, manifest esplicito e note comuni;
  `.games/cache/` e `.games/local/` sono dati locali esclusi da Git.
- `projects/`: progetti di gioco con istruzioni e verifiche proprie.

## Avvio e stato

Per preparare il hub in un nuovo checkout, dopo aver installato mise ed
esaminato la configurazione:

```sh
mise trust
mise install
mise run hub:setup
mise run memory:index
```

I primi strumenti operativi sono:

```sh
mise run hub:check   # catalogo, ruoli, adattatori, skill, schemi e modelli
mise run hub:doctor  # prerequisiti e configurazioni locali
mise run hub:test    # test del validatore e dei contratti
mise run hub:snapshot # hash dell'ultima milestone del hub
mise run workflow -- --help # stato, consegne, pausa e checkpoint umani
mise run claude:run -- --help # worker Claude facoltativo con brief/progetto espliciti
mise run opencode:run -- --help # worker facoltativo con brief/progetto espliciti
```

Il [formato di task e handoff](docs/task-contract.md) spiega come usarli nei
giochi. I controlli non scansionano automaticamente `projects/`; il doctor
non avvia server MCP e non verifica login o inferenza.

Da questa cartella, `mise tasks` elenca i comandi disponibili.
`mise run hub:sync -- --client vscode --apply` registra il MCP memoria nel
workspace VS Code del hub usando la definizione in `hub.json.mcp_servers`.
Setup e applicazione delle configurazioni sono separati: senza `--apply`
vengono generati solo frammenti locali. Il catalogo non è caricato
automaticamente dagli harness: gli adattatori lo traducono nei loro formati.
Per ora la generazione gestisce `games-memory`; gli altri MCP restano nelle
configurazioni esistenti e richiedono verifiche specifiche.
La [guida della memoria](mcp/memory/README.md) descrive ricerca, note,
checkout esterni e adattatori per le TUI.
`mise run agents` apre la finestra VS Code Agents dedicata;
`mise run agents-editor` apre l'editor sullo stesso workspace.
La [guida operativa](docs/vscode-agents.md) descrive configurazione e limiti
verificati.

Il [workflow game-feature](docs/workflows.md) traduce una richiesta con
grafica e gameplay in brief comune, due rami paralleli, integrazione e review.
La skill guida il coordinatore; la CLI conserva lo stato senza avviare agenti
o servizi. Il coordinatore usa le deleghe del runtime e registra gli esecutori
effettivi. I sette adattatori sono presenti; quelli aggiunti dopo coordinatore
e revisore richiedono ancora una verifica di discovery e uso nella UI VS Code.
`--review-after` sceglie checkpoint umani, `pause` ferma i nuovi avvii nel
registro. La CLI non ferma i processi né autentica l'autore delle decisioni.

La [guida dei laboratori](docs/course-lab.md) alterna prompt spiegati, azioni
manuali e verifiche. Per questo workspace i corsi vivono in
`projects/gamehub/2d/` e `projects/gamehub/3d/`, esclusi dal Git del hub insieme
agli altri progetti. Le loro guide iniziali sono preparate; gli esercizi Unity
restano da creare. La skill `local-art` permette di pianificare e produrre
mock e UV senza dipendere dai servizi generativi.

Il runtime Codex `0.153.0` usato da VS Code rileva una sola `task-handoff`,
abilitata e risolta alla sorgente canonica, senza errori di discovery.
Il 21 settembre 2026 l'utente ha confermato che nella finestra Games con Codex
compaiono **games-coordinator** nel menu dei ruoli e **task-handoff** nel menu `/`.
Nella stessa data, la trascrizione della prova eseguita dall'utente conferma
la lettura delle fonti comuni e risposte corrette su integrazione, ambito di
scrittura e limiti del trasferimento di sessione. La prova funzionale minima
di ruolo e skill è superata. Il primo incarico di revisione del hub è in
[docs/verification/coordinator-reviewer/](docs/verification/coordinator-reviewer/README.md):
contiene task, handoff e hash degli input. Il risultato distingue la prova
tramite subagenti della sessione Codex dalla delega nativa di VS Code.
Entrambe sono completate senza rilievi bloccanti, con 13 input invariati.
La delega nell'istanza Games è provata dai log correlati dell'Agent Host e
del runtime, inclusi avvio del revisore e ritorno del rapporto. Gli errori
intermedi dei comandi e i successivi controlli riusciti sono documentati
nell'[esito VS Code](docs/verification/coordinator-reviewer/native-result.md).
La [memoria con file e indice SQLite](mcp/memory/README.md) è implementata:
indice locale, tre strumenti MCP di sola lettura, setup e adattatori.
La [verifica del catalogo MCP](docs/verification/mcp-catalog/README.md)
documenta la generazione delle configurazioni dalla fonte comune.
Il 22 settembre 2026 l'utente ha confermato anche stato, ricerca e lettura
tramite MCP nella sessione VS Code Games, osservando i tool nel debug della
conversazione: [esito della prova](docs/verification/mcp-catalog/vscode-result.md).
La [verifica del workflow](docs/verification/workflow-v1/README.md) documenta
il pilot `projects/prova-3d-pipeline-one`, distinguendo deleghe documentali,
inizializzazione Unity e produzione degli asset. Una chiamata reale da Codex
a Claude Code ha verificato la discovery del MCP Higgsfield: il servizio
richiede ancora autenticazione. Il [percorso di delega](docs/pipelines/claude-higgsfield.md)
non cambia il provider della sessione VS Code. I launcher generali Claude e
OpenCode sono descritti nella [guida degli esecutori](docs/executors.md).
Le generazioni e la pipeline completa nell'engine restano da completare;
inferenza tramite i nuovi launcher, TUI e altre piattaforme richiedono prove proprie.

La [milestone esecutori e controllo umano](docs/verification/flexible-execution/README.md)
riporta controlli locali, review e limiti delle nuove capacità.
Lo [stato operativo del hub](docs/hub-status.md) raccoglie le verifiche
ancora necessarie e l'ordine dei prossimi interventi.

`projects/gc/` resta il sandbox di apprendimento dell'utente ed è fuori dal
lavoro attuale. La configurazione OAuth Claude in VS Code è in sospeso.
