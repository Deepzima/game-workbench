---
id: workflow-model
title: Un prompt al coordinatore avvia grafica e gameplay
scope: hub
status: verified
updated: 2026-09-22
author: Codex, su workflow richiesto dall'utente
sources:
  - docs/agent-execution.md
  - docs/vscode-agents.md
  - docs/workflows.md
  - workflows/game-feature.json
  - skills/game-feature/SKILL.md
  - docs/pipelines/claude-higgsfield.md
  - docs/verification/workflow-v1/README.md
---

L'utente descrive una feature al coordinatore. La skill game-feature guida
brief comune, rami grafica e gameplay in parallelo, integrazione da un solo
incaricato e review indipendente. Il percorso principale usa games-coordinator,
games-graphics, games-programmer e games-reviewer; designer, architect e QA
sono ora adattati per incarichi pertinenti. La presenza dei file non
certifica la discovery o l'esecuzione in ciascun client.

La definizione riutilizzabile vive nel hub; ogni progetto conserva task.json,
workflow.json, input congelati, rapporti e hash in tasks/<id>/. La CLI mise
workflow registra stato e prepara handoff. Il coordinatore avvia i destinatari
tramite il runtime disponibile e annota gli identificativi reali. Non esiste
un daemon che prosegua dopo la chiusura della sessione. I task MCP dei servizi
sono un'eventuale capacità distinta, non l'orchestratore degli agenti.

Proof e dry-run restano espliciti: non costituiscono prove della produzione
di asset o del funzionamento in engine. Un blocco conserva consegne e
tentativi; prima di ripetere una generazione dall'esito incerto si controlla
il relativo ID remoto. Il coordinatore verifica i rapporti, perché gli hash
attestano i file e non la verità delle loro affermazioni.

La prima proof in prova-3d-pipeline-one ha completato due deleghe parallele,
integrazione documentale e review senza rilievi bloccanti nel runtime Codex
desktop. La suite del hub è passata con 90 test. I nuovi adattatori grafica
e programmazione non sono ancora stati esercitati nell'Agent Host VS Code.

Claude Code e OpenCode sono ora esecutori facoltativi, con fallback
diretto entro lo scope. Per il percorso opzionale Higgsfield è documentata
la delega a Claude Code e la raccolta del risultato. La discovery del 22 settembre 2026 ha eseguito Claude
con login claude.ai/Max, ma ha rilevato needs-auth per Higgsfield e nessun
tool MCP disponibile. L'autorizzazione Higgsfield è distinta dal setup OAuth
Claude in VS Code, rimasto sospeso. Generazioni e catena completa
Higgsfield → Meshy → Blender → Unity richiedono ancora verifiche reali.

I checkpoint scelti con review-after richiedono l'accettazione prima delle
fasi dipendenti; pause/resume controllano i nuovi avvii, senza arrestare i
worker già attivi. La CLI verifica le decisioni registrate e gli hash, non
l'identità umana. Per revisionare fasi completate si crea un task correttivo
collegato, senza riscrivere la storia.
