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
La prima integrazione da verificare è quella con Codex nell'istanza VS Code
dedicata già predisposta.

Istruzioni, skills, strumenti e stato dei task devono essere accessibili
attraverso gli adattatori dei rispettivi harness. Conversazioni e sessioni
native restano gestite dal runtime che le ha create: la continuità del lavoro
si basa su brief, artefatti, memoria pertinente e checkpoint del progetto.

Claude Code rimane anche uno strumento delegabile dagli agenti, senza dover
aprire manualmente la sua TUI. Una chiamata CLI delegata restituisce il
risultato alla sessione chiamante; non implica la creazione di una nuova
sessione visibile nella lista di VS Code Agents.

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
- `hub.json` e `agents/`: catalogo e sette ruoli comuni, indipendenti dal provider.
- `skills/`: procedure condivise; la prima è `task-handoff`.
- `.agents/skills` → `../skills`: collegamento simbolico per la discovery
  Codex, senza copie delle procedure.
- `.github/agents/games-coordinator.agent.md`: primo adattatore per il menu
  dei ruoli di VS Code, con riferimento al coordinatore comune.
- `.github/agents/games-reviewer.agent.md`: revisore indipendente, selezionabile
  o destinatario di una delega quando supportata dal runtime.
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
mise run hub:check   # catalogo, ruoli, skill, schemi e modelli
mise run hub:doctor  # prerequisiti e configurazioni locali
mise run hub:test    # test del validatore e dei contratti
mise run hub:snapshot # hash della prova coordinatore-revisore
```

Il [formato di task e handoff](docs/task-contract.md) spiega come usarli nei
giochi. I controlli non scansionano automaticamente `projects/`; il doctor
non avvia server MCP e non verifica login o inferenza.

Da questa cartella, `mise tasks` elenca i comandi disponibili.
`mise run hub:sync -- --client vscode --apply` registra il MCP memoria nel
workspace VS Code del hub. Setup e applicazione delle configurazioni sono
separati: senza `--apply` vengono generati solo frammenti locali.
La [guida della memoria](mcp/memory/README.md) descrive ricerca, note,
checkout esterni e adattatori per le TUI.
`mise run agents` apre la finestra VS Code Agents dedicata;
`mise run agents-editor` apre l'editor sullo stesso workspace.
La [guida operativa](docs/vscode-agents.md) descrive configurazione e limiti
verificati.

Sono presenti il catalogo comune, la skill di handoff, i contratti validabili,
i ruoli Claude esistenti, i task CLI e il launcher VS Code. È stata verificata
la disponibilità del catalogo ChatGPT nell'istanza di prova. Il coordinatore
e il revisore indipendente hanno adattatori per VS Code; gli altri ruoli devono
ancora essere collegati.

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
La compatibilità va verificata nel client e sulla piattaforma effettivi;
la delega a Claude resta da implementare. La verifica della pipeline completa
richiederà poi un piccolo task in un gioco concreto.

`projects/gc/` resta il sandbox di apprendimento dell'utente ed è fuori dal
lavoro attuale. La configurazione OAuth Claude è in sospeso.
