# Memoria, hook, plugin e handoff

Ricerca del 21 settembre 2026, a integrazione della
[proposta sugli harness](harness-game-development.md). Il documento distingue
funzioni documentate e scelte progettuali per `games/`. Le sezioni di ricerca
conservano le alternative considerate; per l'uso corrente fare riferimento
alla [guida games-memory](../mcp/memory/README.md).

La prima base implementata comprende ora il [contratto di task e handoff](task-contract.md)
e la skill associata. È ora implementata anche la memoria v1: manifest di note,
indice SQLite FTS5, strumenti MCP di sola lettura e setup/adattatori mise.
Hook, memoria semantica e runner Claude restano fuori da questa implementazione.

Il percorso principale è VS Code Agents, con TUI Codex e Claude come accessi
alternativi occasionali. La memoria comune e i checkpoint servono anche a
riprendere un task cambiando interfaccia; la cronologia nativa delle chat non
è il formato di scambio. Anche i percorsi interamente dentro VS Code devono
registrare il risultato nel progetto, quando utile alla prosecuzione del task.
La ripresa della medesima sessione nativa fra VS Code e TUI si userà soltanto
quando supportata e verificata; altrimenti si aprirà una nuova sessione dal
pacchetto del task.

## Come si combinano le personalizzazioni

| Componente | Impiego nel hub |
|---|---|
| Istruzioni | Convenzioni e vincoli applicabili al workspace e al gioco |
| Agente | Responsabilità e ambito di un ruolo |
| Skill | Procedura riutilizzabile con input e risultato verificabile |
| Prompt/comando | Punto di ingresso per richiedere una procedura |
| Hook | Script eseguito in risposta a un evento del runtime |
| Plugin | Pacchetto installabile di capacità e integrazioni |
| MCP | Accesso a strumenti, risorse e all'eventuale banca di memoria |

La pagina Microsoft sui [prompt file](https://code.visualstudio.com/docs/agent-customization/prompt-files)
li dichiara deprecati per Agent Host, che non li carica, e indica la migrazione
a skills. Per nuovi comandi riutilizzabili del hub partiremo quindi dalle
skills e verificheremo come ogni client le presenta.

Gli [hook VS Code](https://code.visualstudio.com/docs/agent-customization/hooks)
sono in Preview. I formati Claude e Copilot sono accettati, ma alcuni dettagli
cambiano: per esempio VS Code ignora attualmente i `matcher` Claude e i payload
degli strumenti possono differire. Servono script condivisi con adattatori
per gli eventi effettivamente supportati da ciascun harness.

I [plugin VS Code](https://code.visualstudio.com/docs/agent-customization/agent-plugins)
possono distribuire il materiale del hub. Agent Plugins distingue componenti
portabili, come skills e MCP, da componenti specifici del client, come agenti
e hook. VS Code legge anche pacchetti Claude; questo non prova l'esecuzione
identica di ogni componente in Codex, Claude e Copilot.

Proposta: confezionare il hub come plugin soltanto dopo aver verificato le
singole capacità. Il plugin distribuirà sorgenti e adattatori; non sarà una
seconda copia mantenuta manualmente delle procedure.

## Memoria: tre livelli e una fonte identificabile

1. **Hub:** convenzioni comuni e conoscenza riutilizzabile verificata, con
   contesto di applicabilità (tool, versione, engine, piattaforma).
2. **Progetto:** decisioni, vincoli, configurazione e conoscenze proprie del
   gioco; fonti in `projects/<gioco>/docs/` e negli altri artefatti del progetto.
3. **Task:** stato corrente, tentativi, risultati dei controlli, blocchi e
   prossimo passo; fonti in `projects/<gioco>/tasks/`.

Le istruzioni curate restano nei documenti di ingresso e nelle specifiche.
La memoria ricercabile raccoglie fatti e riferimenti: una nota recuperata non
può concedere permessi o sostituire automaticamente una decisione vigente.

Ogni elemento deve indicare almeno ambito, fonte, revisione/hash quando
disponibile, data, autore della registrazione e stato: proposta, verificato,
superato. Un cambiamento della fonte deve aggiornare o invalidare l'indice.
Le decisioni in conflitto devono restare distinguibili fino alla risoluzione.

### Memorie native e memoria condivisa

[VS Code](https://code.visualstudio.com/docs/agents/run/memory) documenta una
memoria locale con ambiti utente, repository e sessione.
[Claude Code](https://code.claude.com/docs/en/memory) distingue istruzioni
`CLAUDE.md` e auto-memory locale; i subagenti possono avere una propria memoria
persistente. Queste funzioni non documentano una sincronizzazione universale
fra harness.

Proposta: mantenere le memorie native come supporto dei rispettivi runtime e
usare documenti e interfaccia comuni per le informazioni che devono essere
ritrovate da tutti. Ogni agente recupera soltanto gli elementi pertinenti al
task; la disponibilità di un database non carica automaticamente tutto nel
contesto del modello.

### Opzioni di archiviazione

| Opzione | Vantaggio | Impiego proposto |
|---|---|---|
| Markdown + SQLite FTS5 | Documenti leggibili e versionabili, ricerca testuale con filtri e ranking | Base iniziale; SQLite come indice ricostruibile |
| Grafo di memoria MCP | Entità, relazioni e osservazioni | Eventuale supporto a relazioni fra sistemi, asset e contratti |
| Ricerca vettoriale | Recupero per somiglianza semantica | Aggiunta se le ricerche reali mostrano limiti della ricerca testuale |

[SQLite FTS5](https://www.sqlite.org/fts5.html) offre ricerca full-text,
ranking ed estratti. Per il hub, i documenti resterebbero autorevoli e il
database sarebbe un indice locale derivato, escluso dal versionamento.
Le modifiche ai documenti devono aggiornare l'indice; una ricerca dovrebbe
verificare la versione della fonte prima di usare il risultato.

Il [server Memory di riferimento MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
fornisce un grafo persistito in JSONL e ricerca testuale; non è un sistema
completo di gestione dello stato dei task. Richiederebbe comunque convenzioni
per progetto, provenienza e validità. La concorrenza fra processi che scrivono
sullo stesso archivio va verificata prima di adottarlo.

Una ricerca semantica può completare quella testuale; richiede embeddings,
aggiornamento degli indici e filtri per ambito. La documentazione
[Qdrant sulla ricerca testuale e ibrida](https://qdrant.tech/documentation/guides/text-search/)
illustra la distinzione. Non è una dipendenza proposta per la prima fase.

Per più agenti sulla stessa macchina, [SQLite WAL](https://www.sqlite.org/wal.html)
consente letture concorrenti con una scrittura e serializza gli scrittori.
Il database WAL non deve essere condiviso tramite filesystem di rete.

### Interfaccia comune proposta

Un piccolo servizio MCP potrà esporre ricerca, lettura e proposta di
aggiornamenti, con ambito esplicito hub/progetto/task e riferimenti alle
fonti. Le operazioni di scrittura dovranno controllare la revisione attesa
per rilevare aggiornamenti concorrenti. I reviewer possono ricevere soltanto
le operazioni di lettura.

Prima del servizio, gli stessi documenti sono già leggibili con gli strumenti
filesystem. La necessità del database si valuterà sulla qualità del recupero
in task reali, mantenendo identico il significato dei dati.

## Percorsi e attivazione della memoria nella v1

Scelta di design: un componente condiviso chiamato `games-memory` espone
operazioni di memoria; SQLite è il suo archivio interno per gli indici.
Il codice e le configurazioni sono comuni, mentre le fonti e le cache hanno
un ambito esplicito. Questi percorsi e i comandi base sono implementati;
la guida operativa distingue registrazione e verifica in ciascun client.

```text
<hub_root>/
  mcp/memory/                    # codice del server MCP e indicizzatore
  memory/                        # note e conoscenze comuni del hub
  .games/cache/memory.sqlite      # indice del hub, ricostruibile
  projects/<gioco>/
    memory/                      # note e conoscenze del gioco
    docs/                        # specifiche e decisioni autorevoli
    tasks/<id>/                  # brief, stato, evidenze e handoff
    .games/cache/memory.sqlite    # indice del checkout del gioco
```

Le note in `memory/` rimandano alle specifiche e ai risultati dei task;
evitare copie parallele della medesima decisione. File memoria e documenti
saranno versionati nei rispettivi repository. Ogni repository escluderà
`.games/cache/`, inclusi i file SQLite `-wal` e `-shm`.

Il servizio di un gioco legge due indici: hub e checkout corrente. In una
sessione di manutenzione del solo hub legge soltanto quello del hub. Le
radici sono percorsi assoluti normalizzati, passati esplicitamente al server.
Un worktree esterno a `projects/` usa la cache nella propria directory; non
condivide l'indice del codice con altri checkout. L'indicizzatore del hub
non percorre ricorsivamente `projects/`: legge un elenco di fonti ammesse.

### Distribuzione GitHub e preparazione con mise

Requisito confermato dall'utente: il hub deve essere riutilizzabile in altri
ambienti dopo il clone da GitHub. `games-memory` è implementato nel hub;
non richiede la pubblicazione o installazione di un pacchetto autonomo.

Il codice del servizio resta in `mcp/memory/`. `mise` gestisce le versioni
dei runtime e i comandi di preparazione, mentre il package manager installa
le dipendenze del servizio dal lockfile versionato. L'implementazione Node
usa un task mise che invoca `npm ci` nel package del hub. Il backend
[`npm` di mise](https://mise.jdx.dev/dev-tools/backends/npm.html) permette
anche di installare CLI pubblicate, ma le dipendenze del codice presente nel
repository appartengono al suo manifest e lockfile.

Il flusso implementato è:

1. Clonare il repository e accordare la fiducia locale alla configurazione
   mise dopo averla esaminata.
2. `mise install` prepara i runtime dichiarati con versioni precise.
3. `mise run hub:setup` installa le dipendenze bloccate e prepara gli
   adattatori locali. `hub:sync -- --client vscode --apply` registra quello
   VS Code nel hub, preservando le altre entry e rifiutando conflitti.
4. `mise run memory:index` costruisce l'indice locale delle fonti esplicite.
5. Il client selezionato avvia il server stdio attraverso `mise exec`, con
   la directory del checkout e gli argomenti risolti per quell'ambiente.

I [task mise](https://mise.jdx.dev/tasks/) forniscono comandi ripetibili con
gli strumenti del progetto. L'installazione non registra automaticamente
un server in ogni harness: gli adattatori devono configurare separatamente
VS Code, Codex e Claude nei formati supportati. Con il trasporto
[MCP stdio](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#stdio),
il processo viene avviato dal client e scrive su stdout soltanto messaggi
del protocollo. Setup e indicizzazione restano operazioni separate
dall'avvio ordinario; eventuali diagnostiche vanno su stderr.

Vincoli di distribuzione:

- Versionare sorgenti, template, manifest, lockfile e memorie comuni curate.
  Le memorie dei giochi restano nei rispettivi repository.
- Escludere database e cache ricostruibili, credenziali, login, cronologie
  native e configurazioni generate che contengono percorsi della macchina.
  Le fonti Markdown condivise viaggiano con Git; l'indice viene ricostruito
  per ciascun checkout. Non è una sincronizzazione automatica delle chat.
- Derivare i percorsi dal checkout o da argomenti espliciti. Non introdurre
  percorsi dell'autore nei launcher riutilizzabili e non presumere che tutti
  i client espandano le stesse variabili. Gli eventuali percorsi assoluti
  generati localmente non diventano configurazione comune.
- Il setup della memoria deve funzionare senza segreti degli MCP opzionali,
  attivazione della shell personale, Homebrew o Xcode. Eventuali dipendenze
  native devono avere prerequisiti dichiarati e verificati sulle piattaforme
  supportate. Ogni utente autentica separatamente gli harness che utilizza.
- Verificare un clone pulito in un percorso differente, anche con spazi,
  e su ciascuna piattaforma dichiarata. Il launcher dedicato attuale usa
  macOS e zsh: non costituisce prova di supporto Linux o Windows. Anche
  la discovery tramite symlink va verificata sul sistema di destinazione.

Non occorre pubblicare subito il server come pacchetto separato: il checkout
del hub può distribuirne il codice. Un'eventuale release installabile via
backend mise rimane una scelta successiva.

### Tre passaggi distinti

1. **Preparazione:** un task `memory:index` costruisce gli indici delle fonti
   del hub e del progetto selezionato. `hub:sync` genera la configurazione
   nativa necessaria a ogni client, con percorsi e profilo di accesso.
2. **Connessione:** il client avvia `games-memory` come processo MCP stdio,
   attraverso `mise exec` per selezionare strumenti e ambiente. Il processo
   apre i database; SQLite non richiede un daemon separato. Ogni client può
   avere il proprio processo, collegato agli stessi indici del checkout.
3. **Uso:** all'inizio dell'incarico le istruzioni comuni richiedono di leggere
   brief e checkpoint e cercare le memorie pertinenti. A fine fase l'agente
   salva risultati e note nei file del progetto e richiama l'aggiornamento
   dell'indice. Gli hook disponibili automatizzano questi passaggi; il runner
   li esegue esplicitamente nei percorsi senza hook compatibili.

`hub:setup`, `hub:sync`, `memory:index`, `memory:status`, `memory:search` e
`memory:read` sono disponibili. L'automazione tramite hook resta successiva.
Il normale uso non richiede una TUI dedicata al server: il ciclo di vita MCP
appartiene al client. La chiusura del processo non cancella file o indici.

### Registrazione nei client

| Accesso | Registrazione prevista |
|---|---|
| VS Code Agents | Configurazione del workspace supportata dal target scelto, generata per il progetto |
| Codex TUI | `.codex/config.toml` del progetto, nei limiti della configurazione trusted |
| Claude Code TUI | `.mcp.json` del progetto |

VS Code inoltra ad Agent Host le configurazioni ammissibili di
`.vscode/mcp.json`; Agent Host può leggere anche configurazioni workspace
`.mcp.json`. La scelta verrà verificata con il target Codex principale,
evitando registrazioni duplicate. `chat.mcp.autostart` non governa i processi
gestiti autonomamente da Agent Host.
[Configurazione MCP VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

La prima attivazione può richiedere la fiducia nel server/configurazione da
parte del client. In VS Code, `MCP: List Servers` offre stato e comandi di
gestione; in Claude `/mcp` mostra i server. Per Codex, la configurazione MCP
documenta comando, argomenti e directory del processo.
[Gestione VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers),
[MCP Claude](https://code.claude.com/docs/en/mcp),
[MCP Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

La registrazione deve seguire il checkout effettivo: non usare una
configurazione globale che fissa un gioco per tutte le sessioni. I percorsi
devono essere risolti dagli adattatori, senza presumere che tutti i client
espandano le variabili di VS Code.

### Ricerca, aggiornamenti e verifica

L'interfaccia implementata espone `memory_search`, `memory_read` e
`memory_status`. Le modifiche alle fonti passano dai normali
strumenti di editing e dai task autorizzati. Una query di un reviewer non
crea database e non reindicizza: se la cache manca o è vecchia, lo segnala
e restituisce il riferimento alla fonte corrente da leggere.

Le scritture degli indici usano transazioni brevi, con attesa limitata sul
lock. La v1 usa journal DELETE per evitare la creazione di sidecar durante
le letture; WAL rimane un'opzione discussa nella ricerca, non la modalità
attivata. Il coordinamento SQLite protegge il database, non le modifiche Markdown:
per quelle servono proprietà del task e controllo della revisione attesa.
Un aggiornamento concluso deve essere verificabile confrontando hash e
versione delle fonti; indici distinti non richiedono una transazione unica.

La prova minima sarà registrare una nota di test nel progetto, indicizzarla,
ritrovarla dalla sessione Codex in VS Code e poi dalle TUI, modificarla e
verificare che nessun client presenti la vecchia versione come corrente.
Server attivo e strumento disponibile sono controlli distinti dall'effettivo
uso corretto della memoria da parte dell'agente.

## Che cosa significa handoff

| Meccanismo | Comportamento documentato |
|---|---|
| Handoff di un custom agent VS Code | Dopo la risposta propone un pulsante per selezionare un altro agente e preparare il prompt |
| Handoff di sessione VS Code | Trasferisce conversazione e contesto a un altro ambiente/harness nelle combinazioni supportate |
| Delega a subagente | Affida un sottocompito; il risultato ritorna all'agente principale |
| Delega tra harness del hub | Il runner prepara un incarico esplicito e raccoglie risultato e artefatti |

Negli [handoff dei custom agent](https://code.visualstudio.com/docs/agent-customization/custom-agents#handoffs),
`send: true` invia il prompt dopo il click dell'utente; non avvia da solo la
fase successiva. `agent` identifica un ruolo, non un cambio di provider.
La documentazione parla di contesto pertinente mantenuto, senza definire un
formato universale di trasferimento dei file.

L'[handoff di sessione](https://code.visualstudio.com/docs/agents/run/agent-harnesses#hand-off-a-session)
ha limiti propri: attualmente può partire dal target Local; Agent Host può
essere destinazione, ma non espone quel selettore per avviare il trasferimento.
Un ambiente cloud dispone dei propri strumenti e non eredita il runtime locale.

Un [subagente Claude normale](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup)
riceve prompt di delega, istruzioni applicabili e skill precaricate; non
eredita automaticamente tutta la conversazione e la memoria del padre.
Il fork è un caso diverso. La restituzione del risultato al padre non
trasferisce la responsabilità dell'intero task al subagente.

Per una sessione Claude persistente il runner deve registrare il suo ID e
riprenderlo esplicitamente con `--resume`; `--continue` sceglie la sessione
più recente e può essere ambiguo con incarichi concorrenti.
[Ripresa delle sessioni](https://code.claude.com/docs/en/headless#continue-conversations).
Un ID Claude non è un ID di sessione Codex.

### Il pacchetto di passaggio del hub

Per passare lavoro fra harness, il [contratto v1](task-contract.md) definisce
un incarico leggibile e strutturato. Il mittente lo salva soltanto se il suo
incarico consente quella scrittura, altrimenti lo restituisce al coordinatore.
Esempio illustrativo, con nomi e valori fittizi:

```yaml
schema_version: 1
task_id: gameplay-014
project_id: gioco-esempio
from_role: gameplay-programmer
to_role: independent-reviewer
objective: Verificare il comportamento del salto
snapshot: riferimento alla revisione e alle modifiche da esaminare
inputs:
  - tasks/gameplay-014/task.json
  - docs/design/movement.md
  - tasks/gameplay-014/result.md
completed:
  - Implementazione e verifica della compilazione
evidence:
  - tasks/gameplay-014/checks.md
open_items:
  - Verifica su controller ancora da eseguire
next_action: Cercare regressioni rispetto ai criteri del task
write_scope: []
memory_refs:
  - memory/movimento-decisione-003.md
```

La revisione può essere un commit con il relativo diff oppure hash/versioni
degli artefatti se Git non è disponibile. Il runner da implementare caricherà
il ruolo, comporrà il prompt con questo pacchetto e le informazioni pertinenti,
quindi avvierà il
destinatario. I file referenziati devono essere effettivamente accessibili;
per ambienti remoti occorre trasferirli esplicitamente.

Il destinatario restituisce stato, rilievi/modifiche, evidenze e limiti. Il
chiamante integra il risultato e aggiorna il task. Una nuova versione degli
artefatti rende necessario riesaminare le parti cambiate.

## Dove entrano gli hook

Proposta, da tradurre negli eventi disponibili per ciascun runtime:

- All'avvio del task: caricare identità del progetto, incarico e riferimenti
  alla memoria pertinente.
- Dopo una verifica: registrare comando, esito e riferimento all'artefatto.
- Al passaggio di responsabilità: validare e salvare il pacchetto di handoff.
- Alla chiusura: aggiornare l'indice delle fonti modificate e lo stato del task.

Gli script possono validare e persistere dati già prodotti. Un riassunto
ragionato deve essere composto dall'agente; l'hook non lo produce da solo.
Quando un evento non è supportato, il runner deve eseguire esplicitamente
quel passaggio. Non affidare lo stato necessario a riprendere il lavoro al
solo evento di chiusura: crash o interruzioni possono impedirne l'esecuzione.

Per i subagenti Claude, abilitare la memoria persistente aggiunge anche tool
di scrittura: il profilo di un reviewer va verificato rispetto a questo
comportamento. [Memoria dei subagenti](https://code.claude.com/docs/en/sub-agents#enable-persistent-memory).

Il primo esperimento utile sarà riprendere lo stesso task con un harness
diverso usando esclusivamente brief, artefatti e memoria esplicita, verificando
che trovi la versione corretta e riconosca cosa resta da fare.
