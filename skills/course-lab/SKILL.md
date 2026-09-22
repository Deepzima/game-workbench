---
name: course-lab
description: Trasforma una lezione realmente osservata di un corso di game development in un laboratorio ripetibile con azioni dell'utente, deleghe delimitate e verifiche visibili in Blender o Unity quando pertinenti.
---

# Dalla lezione al laboratorio

Usa questa procedura quando l'utente vuole imparare svolgendo una lezione,
ripetere un esercizio o delegarne una parte mantenendo chiaro cosa ha capito
e cosa ha realizzato l'agente. Leggi la [guida](../../docs/course-lab.md) e
usa il [modello di scheda](../../templates/learning/lesson.md).

Leggi il [protocollo di esecuzione](../../docs/agent-execution.md) e attiva
[agent-guardrails](../agent-guardrails/SKILL.md) con i moduli scelti nel brief.
Per un laboratorio sono pertinenti `workspace-scope`, `learning-integrity`
e, nei punti concordati, `human-review`. Aggiungi `readable-code` o
`asset-quality` per il lavoro effettivo; `netcode-performance` riguarda solo
lezioni o estensioni che lo richiedono. Leggi i file dei moduli selezionati e
riportali nella consegna: discovery e caricamento non si presumono.

## Stabilire la fonte e l'obiettivo

Identifica corso, lezione e materiale effettivamente disponibile. Distingui
titolo/sidebar osservati, video visionato, trascrizione letta e note fornite
dall'utente. Un URL o l'accesso al corso non provano di averne letto il
contenuto. Se manca il contenuto necessario, chiedi solo il passaggio o il
risultato che serve; intanto prepara ambiente e scheda senza inventare passi
della lezione. Non aggirare login o limitazioni del servizio.

Concorda un obiettivo osservabile e quale parte l'utente vuole svolgere in
prima persona. Conserva l'approccio del corso dove serve a imparare; eventuali
varianti, refactor o esercizi personali vanno identificati come estensioni.
Non imporre ECS, pattern o asset generati se non appartengono al task.

## Preparare e svolgere la scheda

Copia il modello in `<project_root>/tasks/<lesson-id>/lesson.md`, soltanto
nel progetto e nello scope autorizzati. Non creare task reali nel hub e non
sovrascrivere una scheda già in corso. Registra input, file di partenza,
versioni osservate di Unity/Blender e checkpoint dal quale riprendere.
Per il laboratorio corrente l'utente ha scelto `projects/gamehub/2d/` e
`projects/gamehub/3d/`: scegli la root pertinente e conserva lì titoli, link,
appunti, esercizi e consegne. Per altri laboratori usa il checkout indicato
nell'incarico; quelle directory non sono una dipendenza della skill.
Questa skill e il modello nel hub contengono soltanto il metodo riutilizzabile.

Per ogni passo compila obiettivo, modalità, input/output con versione,
prompt copiabile con spiegazione di come è formulato, azione, risultato
visibile atteso, controllo, evidenza, feedback e piccola variazione da provare.
In modalità **apprendimento**, guida il tentativo dell'utente e
confronta la sua previsione con ciò che osserva; in modalità **delegata**,
esegui la parte assegnata e consegna un risultato controllabile. Puoi alternare
le modalità per passo. La modalità didattica non sostituisce quella del
workflow (`proof`, `dry-run`, `production`).

Quando serve un asset locale usa [local-art](../local-art/SKILL.md). Adatta
azioni e nomi della UI alla versione osservata; non esiste una sequenza CLI
universale che equivalga a usare Blender o Unity. Se la lezione non richiede
Blender, non aggiungerlo come passaggio obbligatorio.

Claude Code e OpenCode sono opzioni per incarichi delimitati quando disponibili
e utili; il laboratorio non richiede di cambiare harness o autenticare servizi
remoti per una prova locale. Uno strumento non disponibile va classificato,
senza trasformare automaticamente il limite in una richiesta di produzione.

## Verificare e riprendere

Confronta il risultato visibile con il criterio del passo. Registra ciò che
hai osservato e ciò che riferisce l'utente; non dichiarare un test eseguito
da una descrizione dell'esito atteso. Per l'apprendimento, chiedi una breve
previsione, spiegazione o variazione pertinente quando utile: il successo
tecnico dell'agente non certifica comprensione.

Conserva feedback umano, decisioni, limiti classificati e prossimo passo nella
scheda. Riparti dall'ultimo checkpoint osservato, senza ripetere operazioni
costose o sovrascrivere il lavoro. Chiudi il laboratorio rispetto al suo
obiettivo documentato, mantenendo separati completamento dell'esercizio,
progresso nel corso e qualità di produzione del progetto.
