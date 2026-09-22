# Task e handoff — formato v1

`hub.json` è il catalogo dei ruoli, delle skills e dei contratti comuni.
Descrive le sorgenti del hub; non registra automaticamente agenti nei runtime.

Ogni gioco conserva i propri incarichi in `tasks/<task_id>/`. I modelli in
`templates/task/` sono esempi da completare, non incarichi già eseguiti:

- `task.json`: obiettivo, responsabilità, input, ambito di scrittura, criteri
  di accettazione, stato, artefatti e verifiche.
- `handoff.json`: incarico per il destinatario, snapshot preciso, risultati,
  evidenze, punti aperti e passo successivo.

Gli schemi validabili sono [task](../schemas/task.schema.json) e
[handoff](../schemas/handoff.schema.json). Il catalogo usa lo
[schema hub](../schemas/hub.schema.json).

## Convenzioni

- `schema_version` vale `1`. Gli ID usano lettere minuscole, cifre e trattini.
- `project_id` identifica il gioco; la directory effettiva del checkout deve
  essere passata al runtime. `task_id` è univoco all'interno del gioco.
- `role`, `from_role` e `to_role` devono indicare ruoli presenti in `hub.json`.
- I riferimenti ai file sono relativi alla root del progetto. Per risorse
  condivise usare `hub:<percorso-relativo>`; il chiamante risolve il prefisso
  nella propria installazione del hub. Sono riferimenti, non shell command.
- `snapshot` identifica gli input e gli artefatti effettivi: commit e diff
  per modifiche non committate, oppure hash/versioni se Git non è disponibile.
- `write_scope` descrive le sole aree da modificare. Un array vuoto significa
  che l'incarico non richiede scritture; non configura da solo la sandbox.
  Nell'handoff riguarda il destinatario; il mittente può salvare il pacchetto
  solo se il proprio incarico consente quella scrittura, altrimenti lo
  restituisce al coordinatore.
- `memory_refs` contiene riferimenti a fonti esistenti, non identificatori
  inventati di un servizio memoria ancora da installare.

## Stato e verifiche

Gli stati sono `planned`, `in_progress`, `blocked`, `in_review` e `done`.
Il coordinatore aggiorna lo stato in base al lavoro reale; il formato non
esegue transizioni automatiche. Un blocco è accompagnato da un `next_action`
concreto e dalla descrizione del limite nel materiale del task.

Ogni controllo indica nome, stato (`passed`, `failed`, `not_run`) ed evidenze.
Una verifica passata richiede almeno un riferimento o una descrizione
riscontrabile del risultato. `done` richiede almeno un controllo, tutti
passati, pertinente ai criteri di accettazione. Per modifiche documentali
può essere un controllo manuale: non serve inventare test di esecuzione.

La validazione strutturale non dimostra che gli input esistano nel checkout,
che le prove siano vere o che ogni criterio sia stato soddisfatto: queste
verifiche appartengono a esecutore e revisore. Un task con controlli richiesti
ancora da eseguire resta aperto; non cancellare controlli falliti per chiuderlo.

## Passaggio di consegne

Il mittente prepara l'handoff per una precisa versione, usando la skill
[task-handoff](../skills/task-handoff/SKILL.md). Il destinatario verifica
progetto, versione, input e ambito prima di operare. Un cambio di versione
richiede di riesaminare le evidenze pertinenti.

Il passaggio non autorizza nuove operazioni esterne e non trasferisce
automaticamente una conversazione fra harness. Il chiamante mantiene la
responsabilità dell'integrazione del risultato.

## Controlli disponibili

```sh
mise run hub:check
mise run hub:doctor
mise run hub:test
```

Il controllo del hub valida catalogo, sorgenti e modelli, senza scansionare
i giochi. Per validare un incarico o un handoff esistente indicarlo
esplicitamente al validatore:

```sh
node scripts/hub.mjs check --task /percorso/assoluto/al/task.json
node scripts/hub.mjs check --handoff /percorso/assoluto/allo/handoff.json
```

Il doctor controlla prerequisiti e configurazioni leggibili; non avvia MCP,
non esegue login e non prova l'inferenza. Il primo adattatore VS Code e il
link alle skill sono descritti nella [guida operativa](vscode-agents.md#primo-ruolo-e-skill-condivisa).
La [memoria condivisa](../mcp/memory/README.md) è disponibile tramite il suo
adattatore. Il [workflow game-feature](workflows.md) aggiunge un registro
delle fasi nel progetto: il coordinatore mantiene anche `task.json`, senza
confondere completamento della run e verifiche del prodotto.
