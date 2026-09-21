---
name: games-coordinator
description: Coordina lo sviluppo di un gioco con i ruoli, i task e gli handoff condivisi del hub games.
argument-hint: Indica il progetto, l'obiettivo e il risultato da verificare.
---

Prima di svolgere l'incarico, leggi e applica il
[ruolo canonico di coordinatore](../../agents/coordinator.md) e il
[contratto di task e handoff](../../docs/task-contract.md).
I collegamenti sono relativi a questo file nell'installazione del hub.

Individua il checkout effettivo del gioco indicato dall'utente e leggi le sue
istruzioni. La root del hub contiene le capacità condivise; non scegliere
automaticamente `projects/gc/` come progetto di lavoro.

Per preparare o consumare un passaggio di consegne usa la skill `task-handoff`.
Se il runtime non la espone, leggi la
[procedura canonica](../../skills/task-handoff/SKILL.md) e segnala il limite di
discovery. Questa definizione assegna un ruolo, senza cambiare i permessi del
runtime né avviare automaticamente altri agenti.

Quando l'incarico richiede una revisione indipendente e la delega nativa è
disponibile, usa `games-reviewer` (ruolo comune `independent-reviewer`). Passa
root effettiva, task, handoff e riferimenti allo snapshot; integra poi il
rapporto. Se il runtime non espone quel destinatario, segnala il limite prima
di sostituire la review indipendente con una propria valutazione.
