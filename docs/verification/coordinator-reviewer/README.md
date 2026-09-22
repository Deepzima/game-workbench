# Prima verifica del passaggio coordinatore → revisore

Incarico di manutenzione del hub `games`, non di un gioco. Per questa prova
`project_id` è `games-hub` e la root effettiva è `/Users/deepzima/games`.
I riferimenti nel pacchetto sono relativi a quella root. I documenti di
questa verifica restano in `docs/verification/`; i task dei giochi continuano
a vivere nei rispettivi progetti.

## Stato

La prova tramite subagenti della sessione Codex del manutentore è completata:
rapporto in [review.md](review.md), integrazione e verifiche finali in
[result.md](result.md). Nessun rilievo bloccante e 13 input invariati.
Anche la successiva prova nel runtime dell'istanza VS Code Games è verificata:
delega a `games-reviewer`, ritorno del rapporto e 13 hash corrispondenti.
Le evidenze correlate e i tentativi di comando falliti prima del successo
sono in [native-result.md](native-result.md).
`handoff.json`, `task.json` e `result.md` conservano consegna e stato della
prima prova; `native-result.md` registra la verifica successiva.

Questo pacchetto è una prova storica, conservata nel commit `a16b2b3`.
L'integrazione successiva del catalogo MCP modifica alcuni dei 13 input:
i suoi controlli sono in [mcp-catalog](../mcp-catalog/README.md).
Gli hash e i rapporti originali rimangono invariati; non attestano le
modifiche successive.

## Obiettivo

Verificare che un revisore indipendente possa ricostruire incarico, snapshot
e criteri dal pacchetto, controllare il contratto e il nuovo adattatore VS Code,
e restituire un rapporto integrabile senza scrivere sui file esaminati.

## Pacchetto

- `task.json`: incarico e stato, aggiornati dal coordinatore.
- `handoff.json`: consegna al revisore con `write_scope: []`.
- `snapshot.json`: SHA-256 degli input esaminati; non include lo stato mutabile
  del task o il futuro rapporto.
- `review.md`: rapporto restituito dal revisore e registrato dal coordinatore.
- `result.md`: verifiche e decisione di integrazione del coordinatore.
- `native-result.md`: evidenze del percorso VS Code e diagnosi degli errori.

I file `review.md` e `result.md` vengono creati soltanto dopo i rispettivi
passaggi. Non rappresentare un file atteso come un'evidenza già disponibile.

## Verificare lo snapshot

Dalla root del hub, sulla revisione storica, usare il comando stabile:

```sh
mise exec -- node scripts/check-snapshot.mjs docs/verification/coordinator-reviewer/snapshot.json
```

Il comando usa il Node dichiarato in `mise.toml`, legge il manifest esplicito e
confronta i SHA-256 senza modificare gli input. File mancanti, manifest non
valido e hash diversi producono un esito di errore. Non ricostruire la verifica
con un lungo `node -e`: lo script evita di dover gestire quote annidate nella
shell. Un comando fallito resta un tentativo fallito anche se una ripetizione
successiva riesce; riportare entrambi gli esiti.

Sul checkout corrente sono attese differenze rispetto a questa prova.
`mise run hub:snapshot` verifica invece lo snapshot della milestone corrente.

## Percorsi di esecuzione

La prima esecuzione usa i subagenti della sessione Codex del manutentore:
coordinatore e revisore hanno contesti separati. Non dimostra che il
selettore o la delega interna di VS Code abbiano eseguito lo stesso passaggio.
Il rapporto deve dichiarare l'esecutore effettivo.

Il seguente incarico appartiene alla revisione storica. Per ripetere una
review sul codice corrente serve un nuovo pacchetto con gli input aggiornati.
Nella finestra Games con Codex e `games-coordinator`, l'incarico originario è:

```text
Verifica la delega nativa di VS Code usando il pacchetto
docs/verification/coordinator-reviewer/handoff.json.
La root effettiva è /Users/deepzima/games e questa è manutenzione del hub.
Verifica prima lo snapshot con:
mise exec -- node scripts/check-snapshot.mjs docs/verification/coordinator-reviewer/snapshot.json
Delega la review a games-reviewer con il
pacchetto completo e write_scope vuoto; riporta nome del destinatario,
stato ed esito della delega e integra verbalmente il rapporto.
Lascia i file invariati: la registrazione di questa prova verrà fatta
dal manutentore. Non avviare MCP né ulteriori deleghe.
Se il destinatario non è disponibile o lo snapshot è cambiato, segnala
il limite senza dichiarare completata la verifica nativa.
```

Il risultato nativo richiede evidenze della delega al destinatario e del
ritorno del rapporto: attività osservata in VS Code oppure log del runtime
correlati alla sessione dell'Agent Host dell'istanza Games. La sola risposta
del coordinatore non basta. Il nome `collaboration.spawn_agent` non distingue
VS Code da altre interfacce; l'osservazione della resa grafica dell'attività
va dichiarata separatamente dalla verifica dell'esecuzione.
