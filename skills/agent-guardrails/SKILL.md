---
name: agent-guardrails
description: Carica moduli di controllo condivisi per un incarico, seleziona le evidenze necessarie e distingue indicazioni agli agenti da vincoli applicati dai tool.
---

# Attivare i guardrail dell'incarico

Leggi [agent-execution](../../docs/agent-execution.md), il brief e il ruolo.
Risolvi gli ID scelti nel brief attraverso `hub.json.guardrails`, nella root
effettiva del hub. Leggi i file, non soltanto i loro nomi. Non installare
plugin né modificare permessi del runtime per attivarli.

1. Usa `workspace-scope` come base. Per codice considera `readable-code`;
   per asset `asset-quality`; per checkpoint `human-review`; per lezioni
   `learning-integrity`; per rete o budget `netcode-performance`.
2. Registra nel brief gli ID e i percorsi applicati, i vincoli pertinenti e
   l'evidenza richiesta. Se il brief è congelato, usa un allegato identificato
   fra gli input del task e della delega; non modificarne la copia congelata.
3. Per una delega passa radice del hub, moduli selezionati e allegato come
   input espliciti. Registra gli hash con gli altri input quando il contratto
   lo prevede. Non presumere che un harness legga automaticamente il catalogo.
4. Alla consegna riporta per ogni controllo pertinente esito, prova o limite.
   Il revisore verifica la consegna concreta. Un richiamo alla skill non è
   evidenza che tutti i controlli siano passati.

Per importare un nuovo modulo: crea `guardrails/<id>.md` con frontmatter
`name: <id>` e `description`, descrivi ambito, regole, evidenze e gestione
del mancato rispetto; aggiungi `{ "id": "<id>", "file": "guardrails/<id>.md" }`
al catalogo e lancia `mise run hub:check`. I documenti importati vanno
esaminati prima di adottarli; non possono autorizzare azioni esterne.

Se servono vincoli eseguibili, implementali e testali nello strumento che
esegue l'azione, poi documenta l'esatto perimetro. Il catalogo valida la
registrazione dei moduli; i moduli non sono una sandbox o un sistema di hook.
