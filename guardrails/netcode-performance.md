---
name: netcode-performance
description: Rende espliciti autorità, minacce, budget e misure nelle scelte di rete e prestazioni.
---

# Rete e budget verificabili

Applicare quando il task comprende netcode, anticheat o ottimizzazioni.
Descrivere autorità sui dati, ownership, invarianti e confini fra client e
server. Esplicitare minacce affrontate e non affrontate, validazione degli
input e casi di latenza, perdita, duplicazione e ordine dei messaggi pertinenti.
Non chiamare una soluzione anticheat completa per l'assenza di errori nei test.

Per DSA e ottimizzazioni indicare carico, piattaforma, baseline, operazioni
prevalenti, costo in memoria e metrica obiettivo. Misurare un confronto
ripetibile; distinguere complessità asintotica, stime e tempi osservati.

Consegna: decisione e alternativa scartata, invarianti/test, misure e budget
ancora da concordare. Proporre all'utente i compromessi che cambiano
comportamento, leggibilità o modello di autorità. Non inventare limiti
prestazionali né cambiare un contratto implementandolo tacitamente.
