---
name: game-feature
description: Coordina una funzionalità di gioco che richiede grafica e gameplay, delegando due rami paralleli e riunendoli per integrazione e review nel progetto.
---

# Da un prompt alla funzionalità integrata

Usa questa procedura quando la richiesta combina contenuti visivi e codice
di gioco. L'utente parla al coordinatore; il coordinatore sceglie i passaggi,
gestisce le dipendenze e rende visibili esito e limiti. Per un cambiamento
piccolo in un solo ambito è sufficiente un incarico diretto.

Le fonti sono il [workflow](../../workflows/game-feature.json), la
[guida dei comandi](../../docs/workflows.md) e il
[contratto di consegna](../../docs/task-contract.md). Risolvi questi link
rispetto al file della skill. I comandi si eseguono dalla root del hub con
`mise run workflow -- ...`; `--project-root` è il checkout reale del gioco.

## Preparazione

Leggi le istruzioni e la memoria pertinente del progetto, il codice e gli
asset da riutilizzare. Leggi [agent-execution](../../docs/agent-execution.md)
e usa `agent-guardrails` per i moduli pertinenti. Trasforma il prompt in un
brief persistente nel gioco, indicando esecutori opzionali, alternative,
mock o finale e checkpoint scelti dall'utente.
Chiarisci soltanto decisioni che impediscono il lavoro: comportamento,
asset di partenza o destinazione realmente ambigui. Non chiedere all'utente
di scegliere manualmente ogni tool o di riscrivere i prompt delle deleghe.

Prepara `tasks/<id>/task.json` dal contratto comune e inizializza una sola
esecuzione identificata dallo stesso task ID. `workflow.json` è il registro
delle fasi; il coordinatore aggiorna separatamente lo stato del task.
La fase `brief`
definisce il contratto comune: identificatori, comportamento, misure,
interfacce codice/asset, rig e animazioni quando pertinenti, budget e criteri
di accettazione. Registra le assunzioni e distingui produzione da prova del
coordinamento. Non considerare approvato il gameplay inventato dall'agente.

## Esecuzione e deleghe

1. Consulta `status` per le fasi pronte. Usa `handoff` per la consegna della
   fase; verifica input, hash, dipendenze e ambito assegnato.
   Se `scheduling.can_start` è falso, non avviare il destinatario: attendi
   il checkpoint o la ripresa. Se il successivo `start` fallisce dopo l'avvio
   del runtime, ferma il destinatario e riconcilia lo stato prima di proseguire.
2. Avvia tramite il runtime i destinatari `games-graphics` e
   `games-programmer` per le fasi pronte `graphics` e `gameplay`. Passa
   radici effettive di hub/progetto, ruolo canonico, brief, contratto comune,
   consegna e modalità della prova. Registra con `start` l'identificatore
   reale del destinatario restituito dal runtime. Il CLI registra stato:
   non avvia agenti al posto tuo. Se il runtime non dispone delle deleghe,
   svolgi direttamente il lavoro fattibile in sequenza e registra l'esecutore
   effettivo; non presentarlo come due agenti separati. Usa `delegate-code`
   per scegliere facoltativamente Claude Code o OpenCode nel ramo di codice.
3. Porta avanti entrambi i rami senza aspettare inutilmente il primo.
   Ciascun agente scrive soltanto nel proprio ambito. Il coordinatore è
   l'unico autore dello stato del workflow. Aggiorna l'utente quando cambia
   qualcosa di utile: ramo concluso, blocco, decisione necessaria.
4. Prima di `finish`, verifica rapporto, artefatti ed evidenze, e che i
   criteri della fase siano coperti. Non trasformare una risposta "fatto"
   in prova: il comando controlla file e hash, non la verità delle affermazioni.
5. Avvia `integration` soltanto dopo entrambi i rami. Assegna a un solo
   `games-programmer` importazione e modifiche alla scena Unity. Se mancano
   engine, account o asset necessari, completa le parti indipendenti e usa
   alternative ammesse dal brief. Registra il requisito ancora scoperto.
6. Affida `review` a `games-reviewer` con ambito di scrittura vuoto. Salva
   tu il rapporto restituito nel task. Chiudi soltanto con verifiche pertinenti
   alla modalità dichiarata; un test del coordinamento non certifica il gioco.

Non nascondere i fallimenti dietro una modalità `proof`: la modalità deve
essere scelta prima della fase ed essere coerente con il brief. Non passare
una consegna simulata a una produzione come se fosse un asset verificato.

## Grafica ed esecutori opzionali

Riutilizza asset o usa [local-art](../local-art/SKILL.md) per produrre mock,
mesh e UV in Blender senza servizi remoti. Il percorso opzionale
[Claude Code → Higgsfield → Meshy](../../docs/pipelines/concept-to-unity.md)
serve quando il brief richiede generazione e le capacità sono disponibili.
Claude restituisce output e ID reali; il coordinatore verifica la consegna.
Se Claude Code manca, prosegui con strumenti equivalenti ammessi oppure
produzione locale appropriata al risultato richiesto. Non chiamare finale
un mock consegnato al posto di un asset richiesto. OAuth Claude in VS Code
rimane sospeso e non è un prerequisito per la produzione locale.

## Intervento umano

Scegli con l'utente i checkpoint utili: `init --review-after graphics`,
per esempio, lascia completare la consegna grafica ma impedisce l'avvio
dell'integrazione finché non è registrata l'accettazione effettiva. Senza
checkpoint gli agenti procedono nel perimetro del brief. Vedi la guida CLI
per `accept`, `pause` e `resume`: pausa del registro e arresto dei worker
sono operazioni distinte. Puoi discutere e mostrare qualunque output;
la revisione di fasi completate passa per un nuovo task correttivo collegato.

## Ripresa

Consulta lo stato salvato prima di aprire nuove deleghe. Se una fase risulta
in corso, verifica l'esecutore registrato prima di rilanciarla. Usa `block`
per rendere esplicito il limite e `retry` soltanto dopo averlo risolto.
Una generazione dall'esito incerto si recupera dal suo ID remoto prima di
considerare una ripetizione, per non duplicare consumi e asset.

I task MCP, quando supportati dal client e dallo strumento, possono seguire
lavori lunghi del servizio. Non sostituiscono il workflow del progetto né
il ritorno delle deleghe al coordinatore.
