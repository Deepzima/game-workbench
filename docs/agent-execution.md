# Esecutori, interventi umani e qualità

Il ruolo definisce il lavoro; l'harness è uno dei mezzi per eseguirlo.
L'agente corrente può completare un incarico direttamente, delegarlo al
runtime disponibile oppure usare Claude Code o OpenCode. Sono strumenti
opzionali: la loro assenza non blocca attività eseguibili con i tool presenti.
Per la delega di codice leggere [delegate-code](../skills/delegate-code/SKILL.md)
e [la guida degli esecutori](executors.md).

## Scelta del percorso

Nel brief registrare risultato atteso, vincoli, ambito, strumenti necessari,
checkpoint e alternative ammesse. Il coordinatore sceglie l'esecutore senza
chiedere all'utente di progettare ogni delega. In mancanza di Claude Code o
OpenCode continua direttamente, dichiarando il cambio di percorso. Prima
di subentrare a un processo dall'esito incerto, accertarne lo stato e
recuperare gli output: due esecutori non devono scrivere sugli stessi file.
Un'attività svolta da sé non è una review indipendente.

Una capacità realmente necessaria può restare indisponibile: un mock non
soddisfa implicitamente una richiesta di asset finale, né una compilazione
sostituisce un playtest. Proseguire sul lavoro indipendente; segnalare il
requisito ancora scoperto. Non cambiare account, provider a pagamento o
budget per nascondere un errore di autenticazione.

Per la grafica scegliere riuso, produzione locale o generazione remota in
base all'obiettivo. [local-art](../skills/local-art/SKILL.md) copre mock,
mesh e UV modificabili senza Higgsfield o Meshy. Il percorso documentato
Claude Code → Higgsfield rimane un'opzione quando richiesto e disponibile.

## Controllo dell'utente

La modalità si sceglie per fase, non per tutto il progetto:

- **In-the-loop**: l'utente esegue un passaggio per imparare oppure esamina
  un risultato concreto prima della fase dipendente. Il brief indica cosa
  mostrare: scena, immagine, diff, diagramma, tabella di parametri o misura.
- **On-the-loop**: gli agenti procedono entro brief, budget e ambito concordati,
  fornendo risultati intermedi ispezionabili. L'utente può intervenire.

Il [controller](workflows.md) offre `--review-after`, `accept`, `pause` e
`resume`. Un checkpoint scelto richiede una vera risposta dell'utente;
assenza di risposta e trascorrere del tempo non equivalgono ad approvazione.
La CLI verifica documenti e hash, non l'identità di chi ha approvato.
`pause` impedisce nuovi avvii nel registro: non interrompe i processi già
attivi. Il coordinatore ferma o conclude quelli interessati prima di
consentire modifiche concorrenti.

Richieste come «fammi vedere il movimento», «togli due nemici» o «spiegami
questa struttura dati» diventano parte dell'incarico. Presentare lo stato
attuale, concordare la variazione necessaria e aggiornare brief e verifiche.
Se cambiano gli input congelati o una fase già completata, aprire un task
correttivo collegato al precedente: conservare consegne e decisioni originali,
poi rieseguire le fasi interessate. Il controller v1 non ricalcola da solo
questa catena di invalidazioni.

## Moduli di controllo

I moduli in `guardrails/`, elencati in `hub.json.guardrails`, si attivano
tramite [agent-guardrails](../skills/agent-guardrails/SKILL.md). Il brief
seleziona quelli pertinenti; una delega li passa come input espliciti.
`workspace-scope` è la base comune; gli altri si scelgono per l'incarico.

Questi documenti guidano gli agenti e la review. `hub:check` ne valida catalogo,
percorsi e frontmatter, **non dimostra che il comportamento li rispetti**.
Solo controlli eseguibili implementati (test, schema, scope del controller,
checkpoint) applicano un vincolo meccanico nel relativo strumento. I permessi
del runtime e la sandbox restano separati; un file Markdown non li imposta.

Una regola utile precisa il vincolo, l'evidenza richiesta e cosa fare se non
è rispettato. Le preferenze dell'utente prevalgono sui moduli; un contrasto
con un requisito del task va reso esplicito, senza inventare approvazioni.

## Apprendimento e gusto

Il codice deve rendere leggibile il modello del gioco. Nomi, responsabilità,
flusso dei dati e test devono aiutare una persona a seguirlo. Pattern,
astrazioni, strutture dati ed ECS si motivano con il problema; misurare
prima di rivendicare un'ottimizzazione. Per rete e anticheat dichiarare
autorità, minacce, invarianti e limiti delle prove.

Il laboratorio [course-lab](course-lab.md) trasforma materiale effettivamente
consultato in passi con prompt, azioni manuali e risultati attesi. Una
variante ECS o un'ottimizzazione è un esperimento distinto quando cambia
l'obiettivo didattico. Il giudizio umano su estetica, sensazione dei comandi
e chiarezza del codice resta esplicito e non viene dedotto da test verdi.
