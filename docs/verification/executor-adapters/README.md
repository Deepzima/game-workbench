# Launcher Claude e catalogo degli adattatori — 22 settembre 2026

Il batch completa il launcher generale Claude Code opzionale e collega i
sette adattatori VS Code ai ruoli canonici nel catalogo. Documentazione,
skill di delega e memoria riflettono il comportamento corrente. Le guide
dei corsi restano di competenza del processo Claude già incaricato e non
fanno parte di questa verifica.

## Perimetro

- `claude:run` riceve progetto e brief, usa stdin e output strutturato,
  controlla esito finale, timeout e interruzioni. Conserva modello e
  autenticazione già configurati, senza aggiungere permessi. MCP esclusi
  per default, selezionabili con un profilo esplicito.
- `hub.json.adapters` è opzionale nel formato v1 e associa i file VS Code
  ai ruoli. `hub:check` verifica metadati, duplicati, collegamento canonico
  e link locali del sottoinsieme Markdown documentato. La review ha fatto
  aggiungere anche il controllo fra ruolo della fase e destinatario del
  workflow: un adattatore valido ma appartenente a un altro ruolo viene
  rifiutato, insieme agli adattatori non catalogati.
- La [guida degli esecutori](../../executors.md) descrive le opzioni e i
  limiti; lo [stato operativo](../../hub-status.md) tiene separati controlli
  locali e prove ancora necessarie.

## Evidenze e limiti

Il [risultato](result.json) registra controlli e review del batch. I test
dei processi usano eseguibili fittizi: non consumano inferenza e non
dimostrano login, successo di un incarico reale o collegamento MCP. La
compatibilità delle opzioni è stata confrontata con Claude Code 2.1.263 e
la documentazione ufficiale.

Questa verifica non riattiva OAuth Claude in VS Code, non usa il browser
dei corsi e non modifica progetti Unity. Non prova discovery o deleghe dei
cinque ruoli aggiunti dopo coordinatore e revisore. Windows non collaudato.

## Snapshot

`mise run hub:snapshot -- docs/verification/executor-adapters/snapshot.json`
confronta [snapshot.json](snapshot.json), che include
le fonti del hub e i controlli di questa milestone. Gli snapshot precedenti
rimangono invariati: un loro confronto con file ora modificati descrive una
differenza di revisione, non un fallimento delle prove storiche.
