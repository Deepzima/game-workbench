---
name: delegate-code
description: Delega opzionalmente un incarico di programmazione a OpenCode o Claude Code CLI, verifica l'esecuzione reale e gestisce il fallback all'agente corrente mantenendo ambito ed evidenze nel progetto.
---

# Delega opzionale di programmazione

Skill del hub games. Segui [esecutori e launcher](../../docs/executors.md) e
il [contratto del task](../../docs/task-contract.md). `<project_root>` indica
il checkout effettivo del gioco, anche in un worktree esterno al hub.

1. Leggi istruzioni, stato e memoria pertinente. Prepara un brief in
   `<project_root>/tasks/` solo se puoi scriverlo: task, obiettivo, input,
   snapshot, `write_scope`, output, verifiche e limiti. Un incarico di review
   non permette di modificare il contenuto esaminato.
2. OpenCode e Claude Code sono esecutori opzionali; l'agente corrente può
   svolgere il lavoro direttamente. Rispetta una scelta esplicita dell'utente.
   Non installare CLI, cambiare provider/modello o autenticazione per rendere
   obbligatoria la delega. Usa `--model` solo per una scelta già autorizzata;
   altrimenti conserva la configurazione disponibile.
3. Verifica versione/help e avvia `mise run claude:run -- ...` oppure
   `mise run opencode:run -- ...` dalla root del hub, con `--project-root`
   assoluta e `--brief` relativo al checkout. Per Claude il launcher invia
   il prompt via stdin, usa output strutturato, limite di turni e timeout.
   Non apre richieste di permesso: valgono le regole già disponibili.
   I server MCP sono esclusi per default; `--mcp-config` seleziona un profilo
   esplicito quando il task richiede tool MCP. Segui i limiti documentati,
   senza aggiungere bypass. La pipeline Higgsfield ha un
   [percorso specifico](../../docs/pipelines/claude-higgsfield.md).
4. Segui il processo effettivo e conserva nel task, se consentito, session ID
   restituito dal runtime, esecutore, input, exit code, eventi pertinenti e
   file consegnati. Se manca un session ID, dichiaralo e usa solo gli
   identificativi di processo/tool realmente osservati. Non dedurre modello,
   indipendenza o successo dal nome del launcher o dal solo exit code 0.
5. Prima di integrare controlla diff, ambiti e verifiche. Se il worker fallisce
   o resta incerto, fermalo e verifica che non scriva ancora prima di un
   subentro; evita tentativi concorrenti sullo stesso ambito. Se manca una
   capacità necessaria, segnala il blocco concreto. Altrimenti prosegui come
   agente corrente, dichiarando il fallback: non presentarlo come una delega
   o una review indipendente.

`cwd` e il `write_scope` scritto nel prompt non sono una sandbox. Le impostazioni
e i permessi dell'esecutore restano effettivi; la configurazione locale può
caricare plugin e servizi. Non bypassare permessi per terminare il task.
Il coordinatore mantiene stato e comunicazione nell'interfaccia dell'utente;
i file del task trasferiscono il lavoro, non la conversazione nativa.
