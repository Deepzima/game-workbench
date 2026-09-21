---
id: memory-model
title: Memoria condivisa basata su file e indice locale
scope: hub
status: verified
updated: 2026-09-21
author: Codex, su design approvato dall'utente
sources:
  - docs/memory-and-handoffs.md
---

Le note Markdown versionate sono la memoria condivisa. SQLite FTS5 è un
indice ricostruibile per ciascun checkout e resta fuori da Git. Un manifest
esplicito elenca le note ammesse: il hub non scandisce i progetti dei giochi.

games-memory espone ricerca, lettura e stato in sola lettura. L'aggiornamento
dell'indice è un comando separato. Hash di note e fonti permettono di
segnalare quando la cache è obsoleta. La memoria non trasferisce le chat
native e non concede permessi agli agenti.
