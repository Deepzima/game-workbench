# Esecutori CLI opzionali

Il coordinatore può lavorare direttamente oppure delegare un incarico
delimitato a OpenCode o Claude Code CLI. Nessuno dei due è un prerequisito
del hub. La scelta dell'esecutore non modifica ruoli, contratto del task o
ambiti di scrittura. La skill [delegate-code](../skills/delegate-code/SKILL.md)
descrive consegna, controllo e fallback.

## OpenCode

Il launcher [scripts/opencode.mjs](../scripts/opencode.mjs) usa il binario
`opencode` nel `PATH`, oppure il singolo eseguibile indicato da `OPENCODE_BIN`.
Non contiene percorsi personali e non installa o autentica niente.

Dalla root del hub, indicando il checkout effettivo del gioco:

```sh
node scripts/opencode.mjs --project-root /checkout/gioco --brief tasks/feature/brief.md
```

Opzioni aggiuntive: `--model provider/model` per una scelta esplicita già
autorizzata e `--timeout-seconds 900` per il limite di tempo. Il timeout
predefinito è 900 secondi; accetta interi da 1 a 86400. Non è un limite di
spesa o token. Il modello resta quello della configurazione OpenCode quando
`--model` è omesso.

La chiamata effettiva è un array di argomenti equivalente a:

```text
opencode run <prompt-del-launcher> --format json --dir <project_root> [--model <provider/model>] --file <brief-assoluto>
```

Il prompt richiede di leggere istruzioni e brief, rispettare `write_scope` e
restituire evidenze. Il brief deve essere un file non vuoto interno al
checkout, anche dopo risoluzione dei symlink. L'allegato è esplicito;
sono rifiutati attraversamenti e segmenti `.env`, `.env.*`, `.git`, `.games`,
`.codex`, `.claude`, anche se raggiunti tramite alias. Il coordinatore deve
comunque escludere segreti dal contenuto del brief e dalle fonti assegnate.
Contenuto e percorsi non sono interpolati in una shell. Lo stdin è chiuso,
stdout conserva gli eventi JSON OpenCode e stderr i diagnostici. Il
coordinatore raccoglie e salva l'output soltanto negli ambiti consentiti,
senza pubblicare credenziali o trascrizioni sensibili.

Il launcher restituisce l'exit code del worker; errori negli argomenti o
nei percorsi usano 2, binario mancante 127, timeout 124, interruzioni
128 + numero del segnale. Inoltra SIGINT/SIGTERM e dopo cinque secondi forza
l'arresto. Su sistemi POSIX segnala il gruppo del processo; su Windows può
terminare soltanto il processo diretto. Processi che si staccano dal gruppo
o azioni remote richiedono verifica separata prima di riprendere il lavoro.

Non passa `--auto`, non riprende automaticamente sessioni e non collega
server esterni. Le impostazioni OpenCode già presenti restano attive,
compresi provider, permessi, plugin e servizi configurati: il launcher non
isola il filesystem e non garantisce che il worker rispetti gli ambiti.
Controllare diff e risultato prima dell'integrazione. Un errore o timeout non
annulla eventuali modifiche già prodotte né equivale a una cancellazione
delle operazioni remote.

Verifica locale del 22 settembre 2026: `opencode --version` restituisce
**1.18.31**; `opencode run --help` conferma messaggio posizionale, `--dir`,
`--file`, `--model` e `--format json`. I test del launcher usano eseguibili
fittizi: non dimostrano autenticazione, disponibilità del provider o riuscita
di un incarico reale. I controlli di processo sono stati eseguiti su macOS;
Windows non è stato collaudato. Nessuna chiamata a un modello è stata eseguita per
aggiungere questa integrazione. Riferimento: [CLI ufficiale OpenCode](https://opencode.ai/docs/cli/#run).

## Claude Code

Il launcher [scripts/claude.mjs](../scripts/claude.mjs) usa `claude` nel
`PATH`, oppure il singolo eseguibile indicato da `CLAUDE_BIN`. Dalla root
del hub:

```sh
mise run claude:run -- --project-root /checkout/gioco --brief tasks/feature/brief.md
```

Il checkout deve essere una directory assoluta e il brief un file relativo,
non vuoto, interno anche dopo la risoluzione dei symlink. Si applicano le
esclusioni dei percorsi riservati descritte per OpenCode. Il contenuto viene
letto e inviato via stdin insieme alle istruzioni del launcher; non viene
interpolato nella shell o esposto negli argomenti del processo.
Brief e profilo MCP possono occupare al massimo 8 MiB ciascuno.

Opzioni: `--model MODEL` solo per una scelta esplicita già autorizzata,
`--max-turns 20`, `--timeout-seconds 900` e `--mcp-config FILE` per un profilo
MCP relativo al checkout. Omettendo `--model` resta la configurazione del
client. Turni e timeout limitano l'esecuzione, non fissano un budget di spesa.
Il launcher accetta da 1 a 1000 turni e da 1 a 86400 secondi.

La CLI viene avviata in modalità print con input testuale e output
`stream-json`, usando `--verbose`. `--permission-mode dontAsk` e
`--permission-prompts none` impediscono attese di conferme interattive:
il launcher non aggiunge permessi. Un tool non già consentito può essere
negato; controllare il rapporto e le evidenze prima del fallback. Non usa
`bypassPermissions`, `--bare` o ripresa automatica, non avvia login e
disabilita l'integrazione Chrome (`--no-chrome`). Il provider e l'account sono quelli della
configurazione locale, non vengono scelti dal hub.

Per default `--strict-mcp-config` riceve un elenco vuoto: il nuovo worker
non eredita automaticamente tutti i server MCP configurati. Quando serve
un server, passare esplicitamente il relativo profilo, senza credenziali
in chiaro. Questo seleziona i server; non li autentica e non autorizza da
solo i loro tool. Il profilo non viene inserito nel prompt o stampato dal
launcher. Può risiedere anche in `.games/local/`, a differenza del brief;
deve contenere un oggetto JSON `mcpServers` e restare nel checkout. Le altre
impostazioni Claude, inclusi hook e plugin locali,
rimangono attive: queste opzioni non sono una sandbox del filesystem.

Stdout conserva gli eventi JSON del runtime; stderr contiene i diagnostici.
Il launcher controlla anche l'evento finale `result`: un errore strutturato
o la sua assenza non sono successo, anche se il processo termina con 0.
L'uscita 0 non dimostra però che i criteri del task siano soddisfatti:
Claude può aver restituito un rapporto di blocco senza errori del runtime.
Il coordinatore deve leggerlo e confrontarlo con file e verifiche.

Per timeout e interruzioni valgono le limitazioni di processo descritte per
OpenCode: gruppo POSIX, arresto forzato dopo cinque secondi e controllo
separato delle operazioni remote. Timeout restituisce 124, binario mancante
127, argomenti non validi 2, interruzioni 128 + numero del segnale; gli altri
fallimenti del runtime restano errori. Nessuna modifica parziale viene
annullata automaticamente.

Il launcher è verificato con help/binario locale **Claude Code 2.1.263** e
processi fittizi nei test, senza un incarico al modello. La precedente
discovery [Claude → Higgsfield](pipelines/claude-higgsfield.md) è una prova
separata: non certifica né questo nuovo launcher in produzione né una
generazione. Il launcher richiede **Claude Code 2.1.259 o successivo** per
`--permission-prompts none`; non aggiorna la CLI automaticamente. Versioni
e capacità del client restano distinte dalla toolchain Node gestita da mise.
Riferimenti: [opzioni CLI](https://code.claude.com/docs/en/cli-reference) e
[permessi](https://code.claude.com/docs/en/permissions).
Le [policy MCP amministrate](https://code.claude.com/docs/en/managed-mcp#servers-passed-with-mcp-config-or-strict-mcp-config)
restano vincolanti e possono impedire l'avvio con un profilo esplicito.

## Risultati e fallback

Per ciascuna delega registrare gli identificativi realmente emessi dal
runtime e confrontare rapporto, eventi e artefatti. Il PID del processo
non sostituisce un session ID mancante. Lo stato del workflow è gestito dal
coordinatore, non dal launcher.

Se un esecutore opzionale manca o fallisce, l'agente corrente può riprendere
il task con le capacità disponibili. Prima arresta e verifica il worker
precedente e controlla le modifiche parziali. Dichiarare esecutore effettivo
e limiti: il lavoro diretto non è una review indipendente né un trasferimento
automatico di sessione. Un requisito esplicito su un esecutore o una capacità
indispensabile non si aggira con un fallback presentato come equivalente.
