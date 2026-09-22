# Laboratorio — <lesson-id>

> Modello da copiare in `<project_root>/tasks/<lesson-id>/lesson.md`.
> Compilare i campi con dati osservati; usare “non osservato” o “non pertinente”
> dove necessario. Questa scheda non è un task eseguito e non sostituisce
> `task.json` o lo stato del workflow quando presenti.

## Fonte e incarico

- Progetto e checkout effettivo: <root>
- Task o workflow collegato, se presente: <percorso e ID>
- Corso, URL e titolo della lezione: <fonte>
- Materiale consultato e riferimento preciso: <titolo/sidebar, video con
  intervallo, trascrizione con riferimento, oppure note dell'utente>
- Contenuto non consultato: <limiti della fonte>
- Obiettivo del laboratorio: <una capacità o un risultato verificabile>
- Criterio di riuscita: <comportamento o risultato osservabile>
- Modalità didattica: <apprendimento, delegata o alternata per passo>
- Modalità workflow, se applicabile: <proof, dry-run o production>
- Ruoli e incaricati: <identità reali quando delegati>
- Ambito di scrittura autorizzato: <directory o nessuna scrittura>
- Moduli guardrail selezionati: <ID pertinenti>
- File di istruzioni e moduli effettivamente letti: <riferimenti>
- Estensioni personali rispetto al corso: <nessuna o differenze esplicite>

## Ambiente e file

| Elemento | Percorso/riferimento | Versione o hash | Stato osservato |
|---|---|---|---|
| Progetto Unity, se pertinente | <percorso> | <versione editor/pacchetti> | <osservato/non verificato> |
| Sorgente Blender, se pertinente | <percorso> | <versione Blender e file> | <osservato/non verificato> |
| Altri input | <percorso> | <revisione/hash> | <disponibilità> |
| Output previsto | <percorso> | <convenzione di versione> | previsto, non ancora verificato |
| Evidenze | <directory del task> | <revisione cui si riferiscono> | <da raccogliere/disponibili> |

Checkpoint iniziale e modo per ripristinarlo senza perdere lavoro: <riferimento>.
Vincoli o budget pertinenti: <requisiti, stime e misure distinti>.

## Passo <numero> — <risultato breve>

Ripetere questa sezione per i passi realmente necessari.

| Campo | Piano concreto del passo |
|---|---|
| Obiettivo e motivo | <cosa imparare/produrre e perché serve> |
| Modalità e responsabile | <apprendimento: utente; delegata: incaricato reale> |
| Fonte del passo | <passaggio osservato della lezione oppure estensione personale> |
| Input | <file, oggetto, scena e versione> |
| Prompt da inviare | <richiesta delimitata, aiuto desiderato e parti da non anticipare> |
| Spiegazione del prompt | <perché chiediamo queste cose, cosa vincolano e quali parti si possono variare> |
| Azione | <operazione concreta nel tool/versione osservati; oppure modifica delegata> |
| Output | <percorso e nuova versione prevista> |
| Risultato visibile atteso | <cosa dovrebbe apparire o succedere> |
| Controllo e criterio di passaggio | <confronto o misura concreta; chi osserva> |
| Punto di feedback umano | <preferenza, previsione, spiegazione o non pertinente> |
| Variazione da provare | <piccola modifica manuale o secondo prompt, effetto previsto e confronto prima/dopo> |

Esito del passo:

- Azioni effettivamente svolte, da chi: <registro breve>
- Risultato osservato e differenza dall'atteso: <fatti>
- Evidenze e revisione: <screenshot, log, file o osservazione dichiarata;
  distinguere osservazione diretta e resoconto dell'utente>
- Controlli: <superati, falliti, non eseguiti con motivo>
- Feedback dell'utente: <parole/decisione ricevute o non raccolto>
- Comprensione osservata, se obiettivo didattico: <previsione o spiegazione
  dell'utente; non dedurla dalla sola riuscita tecnica>
- Limiti e prossimo passo: <categoria e azione nella tabella seguente>

## Limiti e ripresa

Usare solo le categorie pertinenti; una riga non è un blocco obbligatorio.

| Categoria | Evidenza del limite | Passo interessato | Prossima azione/responsabile |
|---|---|---|---|
| Hub | <procedura, ruolo o contratto mancante> | <passo> | <azione> |
| Harness | <tool, delega o accesso UI non disponibile nel runtime> | <passo> | <azione> |
| Autenticazione | <sessione o autorizzazione di servizio mancante; nessun segreto> | <passo> | <azione> |
| Progetto | <pacchetto, asset, configurazione o difetto locale> | <passo> | <azione> |
| Apprendimento | <contenuto non consultato, concetto o tentativo da chiarire> | <passo> | <azione> |

Ultimo checkpoint verificato: <file/scena/versione e passo>.
Prossima azione esatta: <prompt o azione, responsabile, risultato da osservare>.

## Chiusura

- Obiettivo del laboratorio: <raggiunto/parziale/non raggiunto, con evidenza>
- Output realmente prodotti: <percorsi e versioni/hash>
- Cosa sa ripetere o spiegare l'utente: <osservato, dichiarato o non valutato>
- Parti delegate: <quali e chi le ha svolte>
- Feedback creativo e decisioni aperte: <ricevuto/non raccolto/non pertinente>
- Verifiche ancora mancanti: <elenco pertinente>
- Progresso del corso: <dato osservato, dichiarato o non verificato>

Il laboratorio completato non certifica da solo un asset di produzione,
la qualità dell'intero progetto o il completamento del corso.
