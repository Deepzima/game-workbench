# Workflow grafica e gameplay — prima prova

Verifica del 22 settembre 2026, macOS arm64 e Node 22.23.2.
La milestone implementa la UX richiesta: un prompt al coordinatore,
brief comune, grafica e gameplay in parallelo, integrazione e review.

## Capacità implementate

- Skill `game-feature` e adattatori `games-graphics` e `games-programmer`,
  collegati al coordinatore e ai ruoli comuni.
- Definizione `workflows/game-feature.json`, validazione nel catalogo e
  comando mise `workflow` per stato, handoff, avvio registrato, consegna,
  blocco e ripresa. È il coordinatore a eseguire le deleghe del runtime.
- Stato nel progetto, copie e hash degli input, rapporti ed evidenze,
  scrittura esclusiva dello stato e distinzione proof/production.

La [guida operativa](../../workflows.md) descrive comandi e limiti: nessun
daemon, nessun avvio autonomo di agenti, nessuna migrazione delle chat.

## Prova con agenti reali

Il progetto locale `projects/prova-3d-pipeline-one` contiene la run
`tasks/workflow-proof-001/`. Si tratta di una **proof documentale** su una
cassa statica di riferimento, non della produzione di un asset.

1. Il coordinatore ha preparato il contratto comune e congelato gli input.
2. Due agenti distinti, `/root/memory_setup` e `/root/hub_codex_compat`, hanno
   ricevuto gli incarichi graphics e gameplay tramite il runtime Codex
   desktop. Hanno scritto proposte e rapporti in directory distinte.
3. I loro intervalli running si sovrappongono per circa 214 secondi. La fase
   integration è partita dopo entrambe le consegne e ne ha confrontato
   identità, misure, formati, responsabilità e limiti ECS.
4. `/root/workflow_review` ha esaminato i documenti in sola lettura e
   restituito il rapporto al coordinatore: nessun rilievo bloccante,
   12/12 hash riportati corrispondenti. Il coordinatore ha verificato
   separatamente i 10 file delle consegne e l'ordine temporale delle fasi.
5. Il coordinatore ha salvato rapporto e prove e concluso sia la run sia il
   task documentale. Tutte le fasi sono `completed` in modalità `proof`;
   nessuna differenza negli input correnti o storici.

[result.json](result.json) conserva tempi, esecutori, risultati e hash degli
artefatti. I file del progetto sono esclusi dal Git del hub; i relativi hash
documentano questa run locale e non sono file inclusi nel pacchetto pubblico.
L'ID dell'esecutore è stato registrato dopo la delega reale; la CLI, da sola,
non autentica tale ID contro il runtime.

La review è indipendente dagli artefatti del progetto. Il revisore aveva
corretto una parte del controller hub in un incarico precedente: questo
verdetto non viene presentato come review indipendente di quel codice.

## Controlli del hub

- Suite completa: **90/90 test passati**, nessuno saltato.
- Catalogo: **7 ruoli, 2 skill, 2 contratti, 1 MCP, 1 workflow** validi.
- Skill `game-feature`: validazione del formato riuscita.
- Interfaccia mise `workflow --help`: esecuzione riuscita.

La revisione del controller ha rilevato un problema nella ripresa dopo
modifiche lecite dell'integrazione. La correzione conserva input originali
e checkpoint di ripresa; copre anche il file temporaneamente mancante in un
tentativo successivo. I test verificano che modifiche fuori scope o dopo il
checkpoint restino rifiutate. La suite completa è passata dopo la correzione.
Gli esiti sintetici sono in [checks.json](checks.json).

`mise run hub:snapshot -- docs/verification/workflow-v1/snapshot.json`
confronta lo storico [snapshot.json](snapshot.json)
delle fonti comuni. I checkpoint precedenti restano immutati nei rispettivi
pacchetti; non sono stati riscritti per farli corrispondere alle nuove fonti.

## Setup del pilot e verifiche residue

- **Unity:** progetto URP inizializzato con 6000.6.2f1. La prima esecuzione
  nella sandbox è fallita per il socket del Package Manager; quella host
  ha concluso con codice 0. Questo non prova gameplay, Entities o import asset.
- **Claude Code:** delega CLI reale con login claude.ai/Max; il runtime ha
  rilevato Higgsfield `needs-auth`, zero tool MCP e zero generazioni nella
  prova. Vedere [delega Higgsfield](../../pipelines/claude-higgsfield.md).
- **Blender:** `get_addon_status` non ha trovato una connessione; nessuna
  scena è stata modificata. Meshy e Unity MCP non sono stati collaudati qui.
- **VS Code:** questa proof usa Codex desktop. La discovery e il percorso
  completo dei nuovi adattatori nell'Agent Host restano da verificare con
  il [prompt della guida VS Code](../../vscode-agents.md#workflow-grafica-e-gameplay).
- **Produzione:** generazione, rifinitura, import, ECS e osservazione del
  gioco richiedono un task separato con criteri e verifiche reali.

Le prove di coordinamento non riattivano il setup OAuth Claude in VS Code,
che resta sospeso, e non attestano il completamento della pipeline 3D.
