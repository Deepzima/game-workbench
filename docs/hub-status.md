# Stato operativo del hub

Il hub fornisce capacità comuni; l'esecuzione di un gioco o di una lezione
va verificata nel rispettivo progetto. Questa pagina distingue disponibilità
dei file, controlli locali e prove nei runtime. Aggiornamento: 23 settembre 2026.

| Capacità | Stato verificato | Prova ancora necessaria |
|---|---|---|
| Ruoli VS Code | Sette adattatori collegati ai ruoli canonici; coordinatore/revisore verificati; deleghe graphics, gameplay e integration osservate nel pilot | Discovery e uso di designer, architect e QA; una delega non certifica tutte le capacità del ruolo |
| Skill e guardrail | Sei skill e sei moduli validati; `task-handoff`, `game-feature`, `local-art` e guardrail usati nel pilot | Altre skill e scenari da provare; i moduli non applicano permessi del runtime |
| Memoria | Markdown, indice SQLite ricostruibile, MCP in sola lettura; stato/ricerca/lettura confermati in VS Code | Prove delle TUI e di un checkout su un'altra piattaforma |
| Workflow | Stato persistente, dipendenze, consegne e ripresa; pilot con asset e codice reali arrivato al checkpoint dopo integration | Feedback umano sul pilot e review indipendente finale ancora pendenti |
| Esecutori opzionali | Launcher Claude e OpenCode con progetto/brief espliciti e test con processi fittizi | Incarico reale tramite ciascun nuovo launcher, con ID sessione, artefatti e controllo del risultato |
| Produzione locale | Bersaglio `.blend`/FBX, prove UV e import Unity reali; 13 controlli Play Mode con input sintetici | Prova manuale e giudizio visivo dell'utente; rig, animazioni, altri asset e piattaforme |
| Servizi generativi | Discovery Higgsfield tramite Claude eseguita; risposta `needs-auth` | Autenticazione quando richiesta e generazione; Meshy e collegamento Blender da provare |

Le prove precedenti restano consultabili: [delega VS Code](verification/coordinator-reviewer/native-result.md),
[memoria nel client](verification/mcp-catalog/vscode-result.md),
[workflow](verification/workflow-v1/README.md),
[esecutori e controllo umano](verification/flexible-execution/README.md).
Il [batch launcher e adattatori](verification/executor-adapters/README.md)
documenta i controlli successivi sui nuovi strumenti della root.
`hub:check`, `hub:doctor` e uno snapshot valido non attestano da soli login,
discovery, inferenza o comportamento del gioco.

Il [checkpoint del 23 settembre](verification/checkpoint-2026-09-23/README.md)
salva lo stato del hub e riassume le prove del pilot. È un checkpoint WIP,
non una chiusura del task di gioco o un'approvazione umana del risultato.

## Accesso agli engine nel pilot macOS

Nella sessione VS Code del pilot Blender 5.1.2 ha eseguito Python con Full
Access dopo precedenti crash prima dello script con Default Access. Unity
CLI ha risposto dopo Full Access e rigenerazione del descriptor Pipeline:
per Unity i due fattori non sono stati isolati. La produzione successiva e
l'integratore hanno usato permessi estesi autorizzati fino al checkpoint.
Il ripristino di Default Access è un'operazione distinta; il catalogo e i
guardrail non cambiano il preset della chat e non ne limitano tecnicamente
l'accesso. La prova non prescrive Full Access permanente per tutti i task,
né certifica i server MCP Blender/Unity o altri ambienti.

## Prossime verifiche

1. **Ruoli nel client principale.** Aprire una nuova sessione nell'istanza
   VS Code Games e seguire la [prova degli adattatori](vscode-agents.md#sette-ruoli-disponibili-come-file).
   Per i ruoli ancora non provati, registrare sessione, ruolo usato, fonti
   lette e ritorno della consegna.
2. **Chiudere il pilot.** Provare manualmente HubTargetTest, raccogliere il
   feedback umano e poi assegnare la review indipendente. Il
   [workflow](workflows.md) conserva le evidenze; una suite automatica non
   sostituisce il checkpoint umano.
3. **Esecutori alternativi.** Assegnare un incarico circoscritto ai nuovi
   launcher, uno alla volta sullo stesso ambito. Verificare errori, eventuali
   modifiche parziali e fallback prima di integrarli nella routine.
4. **Altri MCP.** Migrare le configurazioni condivise solo dopo aver verificato
   modalità di avvio e collegamento del server interessato. `hub:sync`
   distribuisce oggi soltanto `games-memory`; gli altri server rimangono
   configurazioni native separate.
5. **Nuovo ambiente.** Provare installazione da checkout pulito, memoria e
   launcher sulla piattaforma di destinazione. Il launcher VS Code attuale
   è macOS; i test locali non certificano Windows o Linux.

## Lavori nei progetti

I corsi risiedono in `projects/gamehub/2d/` e `projects/gamehub/3d/`.
Inventari, copertura delle fonti, guide e checkpoint restano lì: una guida
scritta non dimostra che l'esercizio sia stato eseguito. Durante una delega
sulle guide, gli interventi nella root non devono sovrascriverle o usare
contemporaneamente le stesse schede del browser.

Il pilot `projects/prova-3d-pipeline-one/` contiene il progetto Unity e lo
stato della prova della pipeline. `projects/gc/` rimane escluso. OAuth Claude
nell'Agent Host di VS Code resta sospeso; le deleghe CLI non lo riattivano.
