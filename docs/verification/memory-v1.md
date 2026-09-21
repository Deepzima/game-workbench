# Verifica games-memory v1

Data: 21 settembre 2026. Piattaforma eseguita: macOS arm64, Node `22.23.2`,
mise `2026.4.19`. SQLite integrato `3.51.3`, SDK MCP `1.30.0`.

## Implementazione consegnata

- Note Markdown e manifest esplicito `memory/sources.json`; due note comuni
  iniziali con fonti e metadati.
- Indice FTS5 locale in `.games/cache/memory.sqlite`, con transazioni,
  validazione degli hash di note/fonti e isolamento per checkout.
- Server stdio: `memory_status`, `memory_search`, `memory_read`, tutti in
  sola lettura. L'indicizzazione rimane un comando esplicito.
- Task mise di setup, configurazione, indicizzazione, stato, ricerca e lettura.
- Adattatore VS Code portabile nel hub; frammenti locali per Claude e Codex.
  Cache e frammenti ricevono esclusioni Git anche nei checkout esterni.

## Esiti

| Controllo | Esito |
|---|---|
| `mise run hub:test` | 66 test passati, 0 falliti, 0 saltati |
| `mise run hub:check` | 7 ruoli, 1 skill, 2 contratti validi |
| `mise run hub:snapshot` | 13 input della precedente prova invariati |
| `mise run memory:index` nel hub | 2 note indicizzate, stato ready |
| Configurazione reale VS Code | Aggiunto soltanto games-memory; altre entry preservate e `.mcp.json` invariato |
| MCP attraverso il launcher configurato | Discovery dei tre strumenti, status, ricerca e lettura riusciti in due processi nuovi |
| Database prima/dopo le chiamate MCP | Byte invariati |
| Preparazione da copia pulita | Setup, applicazione VS Code, indice e ricerca riusciti senza `.env` o `node_modules` iniziali |

La prova MCP reale ha letto l'entry in `.vscode/mcp.json`, risolto
`${workspaceFolder}` alla root corrente e avviato il comando tramite
`StdioClientTransport` del SDK. Entrambe le connessioni nuove hanno trovato
`memory/decisions/memory-model.md` cercando “memoria”; la lettura ha restituito
lo stesso hash trovato nella ricerca. L'entry imposta
`MISE_AUTO_INSTALL=false` e usa `mise exec --no-deps`.

La copia pulita è stata costruita dai soli sorgenti necessari in una
directory temporanea con spazi, senza copiare credenziali, cache, login o
configurazioni MCP personali. `npm ci` ha usato il lockfile e la cache dei
pacchetti già scaricati. La configurazione VS Code generata non conteneva
il percorso temporaneo. È una prova di trasferimento dei sorgenti, non un
clone da GitHub: il hub non è stato inizializzato, pubblicato o caricato su
un repository remoto. Le copie temporanee sono state eliminate al termine.

I test comprendono cache assente senza scritture, modifica di note/fonti e
manifest, isolamento hub/progetto/task, query letterali, symlink e percorsi
non ammessi, rollback SQLite, database WAL preesistente, aggiornamenti
durante la ricerca, merge JSONC/TOML e conservazione delle altre impostazioni.
Le regole Git sono state provate anche con repository temporanei reali.

La review indipendente degli adattatori ha trovato due problemi, entrambi
corretti e coperti da regressioni: root hub/progetto coincidenti e frammenti
locali potenzialmente versionabili nei progetti esterni.

## Limiti dichiarati

- Le chiamate MCP sono state eseguite da client SDK di prova, non attraverso
  un turno del modello nella finestra VS Code. La registrazione nel workspace
  è presente; il caricamento nella sessione Agents resta da osservare.
- Gli adattatori TUI sono generati e testati in fixture; non sono stati
  applicati alla configurazione Codex o Claude reale. Il generatore evita
  doppie registrazioni VS Code/Claude nello stesso checkout.
- Linux e Windows non sono stati eseguiti su host reali. Il ramo di avvio
  npm per Windows è coperto da test con mock.
- `node:sqlite` emette un avviso sperimentale su Node 22, inviato a stderr;
  il protocollo MCP su stdout rimane valido. Non sono stati nascosti gli avvisi.
- Mise ha emesso avvisi non bloccanti per alcune cache globali non scrivibili
  nella sandbox del manutentore; tutti i comandi elencati hanno terminato con
  uscita 0. La prova pulita con cache mise isolata è passata.
- Non sono stati avviati giochi, chiamati MCP degli engine o modificata
  l'autenticazione Claude. Non sono implementati hook, ricerca vettoriale
  o sincronizzazione delle chat.

Guida operativa: [mcp/memory/README.md](../../mcp/memory/README.md).
