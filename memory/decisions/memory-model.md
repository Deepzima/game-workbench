---
id: memory-model
title: Memoria condivisa basata su file e indice locale
scope: hub
status: verified
updated: 2026-09-22
author: Codex, su design approvato dall'utente
sources:
  - docs/memory-and-handoffs.md
  - hub.json
  - mcp/memory/README.md
  - docs/verification/mcp-catalog/vscode-result.md
---

Le note Markdown versionate sono la memoria condivisa. SQLite FTS5 è un
indice ricostruibile per ciascun checkout e resta fuori da Git. Un manifest
esplicito elenca le note ammesse: il hub non scandisce i progetti dei giochi.

games-memory espone ricerca, lettura e stato in sola lettura. L'aggiornamento
dell'indice è un comando separato. Hash di note e fonti permettono di
segnalare quando la cache è obsoleta. La memoria non trasferisce le chat
native e non concede permessi agli agenti.

La definizione di avvio è in hub.json, sezione mcp_servers. hub:sync genera
gli adattatori per VS Code, Codex e Claude; l'applicazione a un client è
esplicita. Gli harness non caricano direttamente il catalogo. Questa
generazione distribuisce soltanto games-memory e non certifica la
disponibilità degli altri MCP o l'uso della memoria da parte di ogni agente.

Il 22 settembre 2026 l'utente ha confermato la prova minima nella sessione
VS Code Games: stato ready, ricerca di catalogo e lettura della nota tramite
MCP, con i tool visibili nel debug della conversazione e senza terminale
secondo il rapporto dell'agente. La conferma riguarda quella sessione;
le TUI e la memoria di un gioco reale richiedono ancora prove proprie.
