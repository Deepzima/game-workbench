# Esecutori opzionali e laboratori — 22 settembre 2026

Questa milestone aggiunge sette adattatori dei ruoli comuni, quattro nuove
skill (sei totali), sei moduli guardrail, scelta flessibile degli esecutori,
launcher OpenCode e controllo umano del workflow. Le procedure didattiche
e di modellazione locale sono disponibili; non costituiscono esercizi o
produzioni artistiche già eseguiti.

## Verifiche locali

Il [risultato](result.json) riporta esiti e perimetro della suite finale.
Il catalogo verifica ruoli, skill, moduli e riferimenti. I test del controller
coprono checkpoint, accettazioni, pausa/ripresa e compatibilità con vecchie
run; quelli del launcher usano processi fittizi, senza inferenza remota.

La revisione indipendente del controller ha individuato e fatto correggere
due problemi: alterazione di un rapporto antenato approvato non bloccante
e collisione dell'ID valido `constructor` con le proprietà ereditate degli
oggetti JavaScript. Le regressioni fanno parte della verifica finale.
Una review separata di procedure e launcher non ha rilevato altri difetti
azionabili. I ruoli scritti da quel revisore sono esclusi dalla sua review.

La proof preesistente del pilot viene ancora letta come `completed`, con
modalità `proof` e nessun input corrente alterato. Non è stata migrata o
riscritta per aggiungere controlli umani retroattivi.

## Confini della verifica

- `accept` valida decisione, identità del task/fase e hash; non autentica
  la persona. Il coordinatore registra soltanto risposte realmente ricevute.
- `pause` blocca nuovi avvii nel controller; non interrompe processi attivi.
- I guardrail Markdown non costituiscono una sandbox o hook del runtime.
- OpenCode 1.18.31 è installato e l'help è stato controllato. Provider,
  autenticazione e un incarico reale non sono stati provati qui.
- I sette adapter hanno frontmatter valido; per quelli nuovi la discovery
  e l'uso nella finestra VS Code restano da osservare.
- Le guide locali dei corsi hanno struttura e preflight. Non attestano
  lettura dei video, comprensione, creazione di Unity o playtest.
- Il percorso Blender locale ha una skill operativa, senza una produzione
  o verifica UV/rig eseguita in questa milestone.

## Snapshot

`mise run hub:snapshot -- docs/verification/flexible-execution/snapshot.json`
confronta [snapshot.json](snapshot.json). I checkpoint
storici restano nelle rispettive directory e documentano revisioni passate;
non si aggiornano per farli corrispondere a modifiche successive.
Le guide dei corsi e i progetti restano esclusi dallo snapshot del hub.
