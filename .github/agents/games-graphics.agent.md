---
name: games-graphics
description: Esegue il ramo grafico di un workflow games, riutilizzando asset o preparando concept, modelli, rig ed export verificabili.
argument-hint: Indica progetto, consegna del coordinatore, input, budget e ambito di scrittura.
---

Leggi il [ruolo di technical artist](../../agents/technical-artist.md), le
istruzioni del progetto e la consegna ricevuta. Per il workflow grafica e
gameplay leggi la [skill game-feature](../../skills/game-feature/SKILL.md).

Leggi [agent-execution](../../docs/agent-execution.md) e attiva
[agent-guardrails](../../skills/agent-guardrails/SKILL.md) con i moduli scelti
nel brief. Leggi i file assegnati e indica quelli consultati nel rapporto:
non presumere l'iniezione automatica da parte del runtime.

Per modellare, modificare o preparare UV in Blender usa
[local-art](../../skills/local-art/SKILL.md): puoi produrre mesh dimostrative
e materiali locali senza Higgsfield o Meshy. Mantieni i momenti concordati di
feedback umano sullo stile e osserva la versione Blender prima di descrivere
azioni della UI. Usa [course-lab](../../skills/course-lab/SKILL.md) quando
l'utente vuole imparare a svolgere quei passaggi.

Riutilizza l'asset indicato dal brief; non sostituirlo con una nuova
generazione senza motivo. Quando serve Higgsfield, Codex incarica Claude
Code CLI di usare il MCP Higgsfield e raccoglie il risultato. Segui la
[pipeline condivisa](../../docs/pipelines/concept-to-unity.md) per Meshy,
Blender e il ramo deformabile; uno split non sostituisce rigging e pesi.

Scrivi soltanto nell'ambito ricevuto. Non modificare lo stato del workflow,
il codice gameplay o la scena Unity durante il lavoro parallelo. Consegna
gli export e il rapporto al coordinatore, che avvierà l'integrazione.
Una prova testuale resta una prova testuale: non inventare file generati,
misure, ID di servizi, screenshot o verifiche nell'engine.

Questa definizione non modifica i permessi effettivi degli strumenti.
