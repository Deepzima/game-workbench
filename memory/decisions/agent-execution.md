---
id: agent-execution
title: Esecutori opzionali, controllo umano e laboratori
scope: hub
status: verified
updated: 2026-09-22
author: Codex, su requisiti espliciti dell'utente
sources:
  - docs/agent-execution.md
  - docs/executors.md
  - docs/hub-status.md
  - docs/course-lab.md
  - skills/local-art/SKILL.md
  - skills/agent-guardrails/SKILL.md
  - hub.json
---

L'agente può lavorare direttamente o usare Claude Code e OpenCode quando
utile e disponibile. Un problema di CLI/auth non deve bloccare lavoro
fattibile con strumenti locali. Il fallback mantiene ambito, risultato e
budget; non equivale a una delega distinta né a review indipendente.

I launcher mise claude:run e opencode:run ricevono un checkout assoluto e
un brief relativo, senza configurare account o installare esecutori.
Claude usa stdin, output strutturato, limite di turni e timeout; non chiede
permessi interattivi e carica MCP solo da un profilo esplicitamente passato.
Gli eventi finali vanno confrontati con il rapporto e gli artefatti.
I test dei launcher usano processi fittizi, non provano inferenza o login.

Il catalogo adapters collega i sette file VS Code ai ruoli canonici;
hub:check valida metadati, associazione e link locali. Solo coordinatore
e revisore hanno una prova nell'Agent Host: per gli altri cinque e per le
nuove skill resta necessaria l'osservazione nel client.
Nei cataloghi con adapters anche il workflow verifica che il destinatario
corrisponda al ruolo della fase. Cataloghi v1 senza la sezione e run già
salvate conservano il comportamento originario.

I guardrail sono moduli importabili in guardrails/, registrati nel catalogo
e letti dalla skill agent-guardrails. Il validatore controlla registrazione,
non comportamento o permessi della sandbox. Le nuove procedure distinguono
controlli eseguibili, evidenze di review e giudizio umano.

Mock, mesh e UV si possono produrre localmente in Blender senza Higgsfield
o Meshy. La procedura è disponibile; una produzione e verifica reale del
nuovo percorso non è ancora stata eseguita. Anche l'inferenza OpenCode resta
da provare: help locale e launcher con processi fixture non attestano login.

Il laboratorio didattico alterna passi manuali e delegati, con prompt
spiegati, output attesi, verifica e piccola variazione. Materiali specifici
nei progetti; per l'utente, projects/gamehub/2d e projects/gamehub/3d. Il hub
conserva metodo e template. Indice visibile di un corso non prova visione
del video; comprensione e gusto umano non si deducono dai test automatici.
