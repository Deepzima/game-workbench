# Catalogo MCP e memoria condivisa

Verifica del 22 settembre 2026 (Europe/Rome), su macOS arm64 con Node
22.23.2. Riguarda l'integrazione di `games-memory` in `hub.json` e la
generazione delle configurazioni; non modifica i progetti di gioco.

## Risultato

La definizione di avvio è nella sezione `mcp_servers` del catalogo.
`scripts/mcp-catalog.mjs` ne valida schema, identificatori, argomenti ed
entrypoint e risolve le root per il client. `hub:check` include questi
controlli; `hub:setup` e `hub:sync` li usano prima di generare configurazioni.
Gli adattatori preparano tutti gli output dalla stessa lettura del catalogo.

Lo schema v1 supporta Node e stdio con un entrypoint locale dentro `mcp/`.
Il generatore seleziona soltanto `games-memory`. Aggiungere una voce al
catalogo non registra automaticamente un nuovo server nei client.

## Controlli eseguiti

- `mise run hub:test`: **76/76 test superati**, nessuno saltato. Inclusi
  manifest invalidi, percorsi e symlink, duplicati, checkout esterni,
  propagazione delle modifiche del catalogo nei tre formati e conservazione
  della stessa definizione fra generazione e applicazione.
- `mise run hub:check`: 7 ruoli, 1 skill, 2 contratti e 1 MCP validi.
- `mise run hub:sync`: generati i tre frammenti locali.
- `mise run hub:sync -- --client vscode --apply`: entry già corrispondente;
  nessuna modifica necessaria alla configurazione VS Code.
- `mise run memory:index`: indice aggiornato dopo la revisione delle note
  e delle fonti; stato `ready`, 2 documenti.
- Tre sessioni MCP reali avviate da un client SDK: una con l'entry della
  configurazione VS Code e due con i frammenti Claude e Codex. Eseguiti
  discovery, `memory_status`, ricerca di `catalogo` e lettura di
  `memory-model`; hash della nota corrispondente al file corrente.
  Database e configurazioni native invariati durante le letture.

[smoke.json](smoke.json) registra gli esiti delle tre sessioni. Sono prove
del server e degli argomenti di avvio generati: non sono esecuzioni degli
agenti dentro le tre interfacce native. Il client di prova risolve
`${workspaceFolder}` e avvia i processi da una directory diversa dal hub.

Gli avvisi di mise sulla scrittura della cache globale nel sandbox non
hanno impedito test o validazione. Le prove successive usano una cache mise
temporanea scrivibile. L'avviso sperimentale di `node:sqlite` è su stderr;
il protocollo MCP rimane su stdout.

## Prova nella sessione VS Code Games

Successivamente l'utente ha eseguito stato, ricerca di `catalogo` e lettura
della nota dalla sessione VS Code Games. Ha riportato il risultato riuscito,
senza terminale, e confermato la presenza dei tool nel debug della
conversazione. La verifica funzionale minima nel client è quindi confermata
dall'utente; provenienza e limiti sono in [vscode-result.md](vscode-result.md).

## Snapshot e limiti

Lo [snapshot.json](snapshot.json) conserva il checkpoint di questa milestone.
Per confrontarlo con i file correnti usare
`mise run hub:snapshot -- docs/verification/mcp-catalog/snapshot.json`;
le modifiche delle milestone successive producono differenze attese.
Senza argomenti `hub:snapshot` verifica l'ultima milestone del hub.
La prova storica in
[coordinator-reviewer](../coordinator-reviewer/README.md) conserva il proprio
snapshot e i rapporti originali: 3 dei suoi 13 input sono cambiati
(`hub.json`, `schemas/hub.schema.json`, `scripts/hub.mjs`). Gli esiti storici
non vengono estesi alle nuove modifiche.

Resta da verificare l'uso dei tre strumenti nelle TUI e con la memoria di un
gioco reale. Gli altri MCP non sono migrati né avviati da
questa verifica; autenticazioni, connessioni e operazioni negli engine
richiedono prove separate. Linux e Windows non sono stati provati su host
reali. La configurazione OAuth Claude rimane sospesa.
