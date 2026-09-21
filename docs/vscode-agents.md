# VS Code Agents per games

Usiamo la stessa applicazione VS Code con una directory dati separata. Questo
produce due processi principali distinti: l'istanza normale, con GitHub, e quella
dedicata a `games`. L'icona normale di VS Code apre l'istanza predefinita.

## Riaprire l'istanza Games

Da un terminale:

```sh
cd /Users/deepzima/games
mise run agents
```

Al primo avvio seleziona la cartella `/Users/deepzima/games` nel selettore della
finestra Agents. Nella versione 1.138 l'opzione CLI `--agents` non trasmette la
cartella alla finestra; il percorso viene invece rispettato nell'editor.

Per aprire anche l'editor nella stessa istanza:

```sh
mise run agents-editor
```

L'editor apre direttamente `games`; da lì puoi usare **Open Workspace in Agents
Window** per aprire il progetto nella vista Agents.

I dati rimangono in `~/Library/Application Support/Code-Games-Agents`, anche dopo
il riavvio del Mac. Il launcher non sovrascrive impostazioni già esistenti.
`mise run agents-check` mostra il percorso e se l'istanza risulta aperta.

Impostazioni, estensioni, storage condiviso e accesso GitHub di VS Code sono
separati. La cartella
`games` è la stessa: modifiche fatte da una finestra sono visibili nell'altra.
Le configurazioni utente di Codex (`~/.codex`) e Claude Code (`~/.claude`) rimangono
condivise. Questa separazione non è una sandbox di sicurezza.

Per conservare la configurazione verificata, lascia GitHub disconnesso
nell'istanza Games. Nel test con VS Code 1.138, il profilo principale con GitHub
Free impediva l'avvio iniziale di Codex, mentre l'istanza separata mostrava i
modelli ChatGPT. Puoi continuare a usare GitHub nell'istanza normale.

## Codex

Scegli Codex nella finestra Agents. Se richiesto, completa il download del suo
SDK e scegli “Sign in to ChatGPT” nel menu account. L'accesso Codex esistente
può essere riutilizzato. Verifica che il menu modelli mostri il gruppo ChatGPT.

## Primo ruolo e skill condivisa

La root contiene due collegamenti al catalogo comune:

```text
.github/agents/games-coordinator.agent.md  # adattatore del ruolo
.agents/skills -> ../skills               # link simbolico relativo
```

L'adattatore aggiunge nome e descrizione per VS Code e istruisce l'agente a
leggere `agents/coordinator.md` e il contratto dei task. I link Markdown nel
corpo non vengono espansi dal parser: la lettura deve avvenire durante il task.
I metadati del runtime restano così separati dalle responsabilità comuni.

Per le skill usiamo direttamente `ln -s`: la directory `.agents/skills`
punta a `../skills`. Non ci sono copie da sincronizzare. Il link relativo
rimane valido spostando l'intero hub; un progetto in un altro checkout avrà
bisogno del proprio collegamento esplicito. Non presumere l'eredità fra
repository separati.

Verifica locale del 21 settembre 2026:

- VS Code `1.138.0` usa il runtime Codex `0.153.0`, distinto dalla CLI di
  sistema `0.154.0`.
- Interrogando `skills/list` con working directory `/Users/deepzima/games`,
  lo stesso binario usato da VS Code restituisce una sola `task-handoff`,
  abilitata, con scope `repo` e percorso canonico
  `/Users/deepzima/games/skills/task-handoff/SKILL.md`.
- Nessun errore di discovery per il hub; i riferimenti dalla sorgente a
  contratto e schemi sono leggibili. La prova non ha aperto thread, inviato
  prompt al modello o avviato server MCP.
- Il 21 settembre 2026 l'utente ha confermato nella finestra Games con Codex
  la presenza di **games-coordinator** nel menu dei ruoli e di **task-handoff**
  nel menu `/`. Questa verifica della UI è riferita dall'utente.
- Prova funzionale minima superata nella stessa data, sulla base della
  trascrizione condivisa dall'utente: l'agente ha letto skill, esempio,
  ruolo, contratto e schema, e ha risposto correttamente alle domande sul
  passaggio. La successiva delega fra coordinatore e revisore è verificata
  tramite i log correlati, come descritto sotto.

Per ripetere la verifica delle istruzioni nella finestra Games:

1. Scegli `games` come cartella e **Codex** come harness; usa la cartella
   corrente, senza creare un worktree che escluda i file non committati.
2. Seleziona **games-coordinator** nel menu dei ruoli.
3. Digita `/` nel prompt e cerca **task-handoff**. Se una sessione già aperta
   non aggiorna le personalizzazioni, verifica in una nuova sessione.
4. Per una prova di sola lettura, invoca la skill e chiedi:

   > Questa è una verifica del setup, non un task di gioco. Leggi il tuo ruolo
   > e la skill task-handoff, poi esamina templates/task/handoff.json come
   > esempio fittizio. Indica le fonti lette, chi integra la consegna e come
   > deve comportarsi un mittente con write_scope vuoto. Non modificare file,
   > non avviare MCP e non delegare ad altri agenti.

La prova riesce quando l'attività mostra la lettura delle fonti comuni e la
risposta attribuisce l'integrazione al chiamante, restituendo l'handoff al
coordinatore quando il mittente non può salvarlo. Questo conferma caricamento
e applicazione di base; il passaggio fra esecutori su un gioco reale è una
verifica successiva.

Nella prova eseguita, l'attività riportata contiene questi comandi:

```sh
cat skills/task-handoff/SKILL.md templates/task/handoff.json
cat agents/coordinator.md docs/task-contract.md
cat schemas/handoff.schema.json
```

La risposta identifica il chiamante come responsabile dell'integrazione;
con il proprio `write_scope: []` il mittente restituisce il pacchetto al
coordinatore senza salvarlo. Distingue inoltre l'ambito del destinatario
contenuto nell'handoff e chiarisce che il pacchetto non trasferisce la chat
nativa né avvia deleghe. La trascrizione dichiara nessuna modifica ai file,
nessun MCP avviato e nessuna delega. Questa verifica riguarda un esempio
e istruzioni esplicitamente invocate, non l'attivazione automatica della
skill o l'applicazione dei permessi da parte della sandbox.

Riferimento: [configurazione di skill e ruoli per Codex in VS Code](https://code.visualstudio.com/docs/agents/guides/customize-copilot-guide).

## Coordinatore e revisore indipendente

`games-reviewer` è l'adattatore VS Code del ruolo comune
`independent-reviewer`. Legge il ruolo originale, il contratto e la skill di
handoff. `games-coordinator` lo indica come destinatario delle revisioni
indipendenti richieste dall'incarico, quando la delega nativa è disponibile.

La preparazione e la prova del pacchetto sono conservate in
[docs/verification/coordinator-reviewer/](verification/coordinator-reviewer/README.md).
È manutenzione del hub: non usa `gc` e non crea un nuovo gioco. Lo snapshot
SHA-256 permette di verificare che il revisore abbia esaminato gli stessi
file poi integrati dal coordinatore.

La prima prova tramite subagenti Codex è completata: rapporto restituito da
un revisore con contesto separato, registrato dal coordinatore e input
verificati di nuovo tramite hash. Nessun rilievo bloccante. L'esito completo
è in [result.md](verification/coordinator-reviewer/result.md).

La prova successiva nell'istanza VS Code Games è anch'essa completata:
l'Agent Host registra la sessione principale, che carica `games-coordinator`
e avvia un figlio con ruolo `games-reviewer`. Il rapporto torna al chiamante
e il controllo finale conferma 13 hash corrispondenti. Evidenze e tentativi
falliti prima del successo sono in [native-result.md](verification/coordinator-reviewer/native-result.md).

I due percorsi vanno attribuiti alla sessione effettiva. Il nome dello
strumento `collaboration.spawn_agent` non identifica l'interfaccia: può
essere usato dal runtime Codex in VS Code. La correlazione fra Agent Host,
sessione principale e figlio verifica l'esecuzione; la resa grafica degli
eventi non è stata osservata direttamente dal manutentore. La presenza del
solo file `games-reviewer.agent.md` non sarebbe invece una prova di delega.

Per controllare nuovamente gli input usare `mise run hub:snapshot`.
Il comando stabile è verificato localmente; non è ancora stato provato
nell'ambiente VS Code che ha prodotto gli errori OpenSSL e Python/Xcode.

## Verificare Claude Max

**In sospeso su richiesta dell'utente (21 settembre 2026).** La procedura è
conservata come riferimento; riprenderla solo quando richiesto.

La versione 1.138 può non riconoscere nell'Agent Host il login Claude Code
conservato nel Portachiavi macOS. Microsoft documenta l'uso esplicito di
`CLAUDE_CODE_OAUTH_TOKEN` come alternativa.

1. Da un terminale in `games`, esegui `mise run claude-token` e completa
   l'autorizzazione nel browser. Il comando mostra un token OAuth del tuo
   abbonamento. Non incollarlo nelle chat o nei file di progetto.
2. Chiudi completamente la sola istanza Games di VS Code con **Code → Esci**.
   Chiudere una finestra può lasciare il processo aperto. Il launcher verifica
   questa condizione prima di chiedere il token.
3. Esegui `mise run agents-claude` e incolla il token al prompt nascosto.
   Il launcher lo passa nell'ambiente del nuovo processo, senza scriverlo su
   disco o inserirlo negli argomenti del comando.
4. Nella finestra Agents seleziona Claude. Completa l'eventuale download SDK e
   verifica la comparsa dei modelli Anthropic. Se necessario, usa “reload the
   configuration”.
5. Per verificare anche l'inferenza, invia un messaggio minimo, per esempio:
   “Rispondi soltanto OK. Non usare strumenti e non modificare file”. Questo
   consuma una piccola parte della quota dell'abbonamento.

Il test è completo solo quando compare una risposta e il modello selezionato
appartiene al provider Anthropic. In precedenza è stato verificato il catalogo
ChatGPT di Codex; la prova con token Claude resta da eseguire.

Il token rimane disponibile finché l'istanza è aperta. Dopo averla chiusa del
tutto o dopo un riavvio del Mac, usa di nuovo `mise run agents-claude` per
fornirlo. La gestione o conservazione del token resta a te: questi task non
implementano uno storage delle credenziali. `mise run agents` da solo non
recupera un token precedentemente inserito.

Il token di `claude setup-token` usa l'abbonamento Claude; una chiave API
Anthropic usa invece la fatturazione API. Il launcher segnala eventuali
variabili d'ambiente API/provider incompatibili prima della prova. Eventuali
credenziali configurate altrove nelle impostazioni Claude vanno controllate
se il provider o l'account mostrato non è quello atteso.

## Fonti

- [Configurazione degli harness in VS Code](https://code.visualstudio.com/docs/agents/run/agent-harnesses)
- [Token OAuth Claude](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token)
- [Segnalazione sul login Claude nel Portachiavi](https://github.com/microsoft/vscode/issues/333738)
