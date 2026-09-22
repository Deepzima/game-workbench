---
name: local-art
description: Crea o modifica mesh dimostrative, UV e materiali locali in Blender e prepara una consegna verificabile per il gioco, senza richiedere servizi di generazione remoti.
---

# Grafica locale con Blender

Usa questa procedura per modellazione locale, modifiche di asset esistenti,
prove di UV, materiali e piccoli asset di esercizio. Per una generazione
remota richiesta dal brief segui invece la pipeline pertinente: Higgsfield
e Meshy non sono prerequisiti della lavorazione locale.

Leggi le istruzioni del progetto e il
[protocollo di esecuzione](../../docs/agent-execution.md). Attiva
[agent-guardrails](../agent-guardrails/SKILL.md) con gli ID selezionati nel
brief e leggi i relativi file. Sono normalmente pertinenti `workspace-scope`
e `asset-quality`; usa `human-review` per i punti di feedback concordati e
`learning-integrity` quando l'utente vuole imparare facendo. Riporta i file
consultati, senza presumere che il runtime abbia caricato i moduli.

## Preparare una lavorazione concreta

Identifica checkout, task, asset ID, uso previsto e file sorgente. Leggi gli
asset assegnati prima di sostituirli. Rendi espliciti formato, unità, pivot,
orientamento e budget realmente necessari: geometria, materiali, texture o
LOD. Distingui limiti richiesti, stime e misure; non inventare un budget solo
per compilare un campo.

Osserva versione Blender, file aperto e strumenti effettivamente disponibili.
Una UI accessibile, una CLI installata e un MCP connesso sono capacità diverse.
Non presentare comandi di terminale, nomi di pannelli o scorciatoie come
universali: verifica la versione e il contesto prima di usarli o descriverli.
Se l'UI non è osservabile puoi preparare una lavorazione con gli strumenti
locali disponibili, ma dichiara quale controllo visivo resta da fare.

Concorda la modalità del passo, distinta da `proof`/`production` del workflow:

- **Apprendimento:** l'utente compie l'azione in Blender; spiega obiettivo,
  azione breve, risultato atteso e controllo, poi usa il suo tentativo come
  base del feedback. Non modificare in anticipo ciò che vuole esercitare.
- **Delegata:** crea o modifica tu gli artefatti nello scope autorizzato e
  restituisci sorgente, export, controlli e limiti. L'utente valuta il risultato
  nei punti concordati, senza dover ripetere ogni operazione tecnica.

Per una sequenza didattica completa usa [course-lab](../course-lab/SKILL.md).

## Modellare, osservare, consegnare

1. Salva una versione identificabile del sorgente prima di modificare un
   asset esistente. Usa i percorsi del progetto; in assenza di convenzioni
   puoi proporre `assets/source/<asset-id>/`, `assets/exports/<asset-id>/`
   e `tasks/<task-id>/evidence/`. Sono destinazioni da rendere reali nello
   scope del task, non file già esistenti.
2. Crea o modifica la mesh necessaria con modellazione diretta, procedure
   locali o asset assegnati. Verifica silhouette e proporzioni rispetto
   all'uso previsto. Per un mock basta una forma sufficiente al suo scopo;
   dichiaralo come tale e non attribuirgli una qualità finale non verificata.
3. Quando il task richiede UV, prepara tagli e isole adatti alla superficie;
   osserva una texture di controllo e verifica distorsioni, cuciture,
   orientamento, sovrapposizioni intenzionali e margini. Registra eventuali
   limiti anziché dichiarare UV corrette dalla sola esistenza del layer.
4. Controlla scala, origine, trasformazioni, normali e materiali pertinenti.
   Mostra la revisione su cui chiedere feedback di gusto: silhouette,
   proporzioni, leggibilità o superficie. Riporta il feedback umano ricevuto
   e le decisioni ancora aperte; non inventare un'approvazione.
5. Conserva il `.blend` modificabile fuori dalle copie importate in Unity.
   Esporta nel formato richiesto e registra versione, impostazioni e identità
   del file. Consegna all'unico incaricato dell'integrazione, se il task
   separa questo ruolo. Un export riuscito non prova l'importazione.
6. Se l'import e l'engine rientrano nell'incarico, verifica nella versione
   effettiva di Unity dimensioni, pivot, materiali e risultato in scena.
   Separa import, compilazione quando pertinente, osservazione e playtest.
   Un'immagine Blender non è un'evidenza del risultato Unity.

Rig, skinning e deformazioni richiedono un obiettivo proprio; mesh separate
o un mock statico non ne dimostrano il funzionamento.

## Restituire il risultato

Riporta input/output con percorsi e versioni o hash, operazioni eseguite,
risultato visibile osservato, misure e controlli non eseguiti. Collega le
evidenze alla revisione esaminata; distingui screenshot, log e dichiarazioni
dell'utente. Separa i limiti di hub, harness, autenticazione, progetto e
apprendimento secondo il protocollo comune. Nessuna credenziale remota è
necessaria per attestare una lavorazione interamente locale.
