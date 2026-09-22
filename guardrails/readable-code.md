---
name: readable-code
description: Richiede codice comprensibile, astrazioni motivate e verifiche del comportamento.
---

# Codice leggibile e motivato

Applicare a implementazione, architettura e review di codice. Usare nomi del
dominio, responsabilità chiare, flusso dei dati tracciabile e dipendenze
esplicite. Separare regole del gioco e integrazioni quando aiuta a testarle.
Seguire le convenzioni del progetto e spiegare gli invarianti difficili.

Motivare un pattern o una struttura dati con necessità, operazioni prevalenti,
costi rilevanti e alternativa semplice. Evitare layer, interfacce e sistemi
generici senza un caso concreto. Non convertire un esempio didattico in ECS
o introdurre netcode se l'incarico non lo richiede.

Consegna: diff navigabile, breve spiegazione del percorso dei dati, test dei
comportamenti o casi limite modificati e compromessi. Prestazioni misurate
se rivendicate; indicare esplicitamente stime e test non eseguiti.
Se un contratto non si adatta, riportare il problema prima di ridisegnarlo.
Preferenze dell'utente su DSA o astrazioni si applicano dichiarando i tradeoff.
