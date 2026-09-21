---
name: task-handoff
description: Prepara o consuma un passaggio di consegne per un task di gioco nel hub games, fra ruoli, harness o interfacce, usando stato e artefatti espliciti del progetto.
---

# Passaggio di consegne del task

Skill specifica del hub `games/`. Leggi il
[contratto del task](../../docs/task-contract.md) e lo schema pertinente:
[task](../../schemas/task.schema.json) o
[handoff](../../schemas/handoff.schema.json). Le fonti appartengono al hub;
gli adattatori della skill devono mantenerle accessibili.

`<project_root>` è il checkout o worktree del gioco indicato nell'incarico,
anche quando si trova fuori da `games/projects/`. I percorsi di task, documenti
e artefatti si risolvono rispetto a questa root effettiva.

## Preparare il passaggio

1. Identifica il progetto e il task reali, leggi le loro istruzioni e verifica
   lo stato corrente degli artefatti. Salva il passaggio in
   `<project_root>/tasks/` secondo il contratto soltanto se il `write_scope`
   del tuo incarico consente quella scrittura. Altrimenti, anche con `write_scope: []`,
   restituisci il pacchetto al coordinatore affinché lo registri.
2. Compila i campi richiesti dallo schema:
   - `schema_version`: usa `1` per la versione corrente del contratto.
   - `task_id`, `project_id`: identità del lavoro e del gioco.
   - `from_role`, `to_role`: responsabilità di chi consegna e di chi riceve.
   - `objective`, `next_action`, `write_scope`: risultato richiesto, prossimo
     passo e ambito di scrittura già autorizzato per il destinatario.
   - `snapshot`: revisione e modifiche, oppure hash/versioni degli artefatti
     effettivamente osservati.
   - `inputs`, `memory_refs`: riferimenti alle fonti pertinenti e alla memoria
     esplicita; usa la base dei percorsi definita nel contratto.
   - `completed`, `evidence`, `open_items`: lavoro svolto, prove con esito e
     questioni ancora aperte. Distingui controlli falliti e non eseguiti.
3. Verifica accessibilità dei riferimenti e corrispondenza tra snapshot ed
   evidenze. Riporta le informazioni mancanti senza inventare ID, contenuti,
   misure o risultati. Mantieni eventuali blocchi espliciti.

## Consumare il passaggio

Il destinatario legge incarico, istruzioni del gioco e fonti referenziate;
controlla snapshot, criteri e ambito prima di agire. Le note di memoria aiutano
a ritrovare le decisioni, ma non sostituiscono le fonti vigenti né ampliano i
permessi. Se una fonte è cambiata, identifica la differenza e non presentare come
attuali le evidenze della versione precedente.

Esegui il sottocompito assegnato e restituisci stato, risultato, evidenze,
limiti e prossimo passo. Un reviewer non modifica l'oggetto della review;
scrive il rapporto soltanto dove consentito. Il chiamante integra il risultato
e aggiorna lo stato del task secondo il contratto.

Questo pacchetto conserva il lavoro fra VS Code Agents e TUI. La ripresa della
conversazione nativa dipende dal client e dall'harness: un passaggio salvato non
avvia una delega e non dimostra che una sessione sia stata trasferita. Quando
una delega viene eseguita, il chiamante ne riporta stato ed esito nell'interfaccia
da cui l'utente sta lavorando.
