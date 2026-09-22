# Laboratori del corso

Questa guida collega una lezione osservata a un esercizio ripetibile nel
progetto: richiesta al coordinatore, azione pratica, risultato visibile e
feedback. La [skill course-lab](../skills/course-lab/SKILL.md) applica il
metodo; la [scheda](../templates/learning/lesson.md) conserva il punto da cui
riprendere in `tasks/<lesson-id>/lesson.md` del progetto, mai come task reale
nella root del hub.

## Materiale del corso e contenuto disponibile

Nel laboratorio corrente i materiali dei corsi vivono in
`projects/gamehub/2d/` e `projects/gamehub/3d/`, directory locali escluse dal
Git del hub. Altri checkout usano il progetto scelto dall'utente. Titoli, link alle lezioni,
indice osservato, note, esercizi, asset, codice e stato didattico appartengono
a quelle directory. Questa guida conserva solo il metodo riutilizzabile.
Per i prompt successivi, `<project_root>` e `<root>` indicano il percorso
effettivo dell'area 2D o 3D scelta; le schede restano sotto il suo `tasks/`.

Per preparare una lezione servono il suo contenuto accessibile, un passaggio
fornito dall'utente o il risultato che l'utente ha osservato. Distingui pagina
e indice, video visionato e trascrizione letta: titolo, accesso autenticato
e URL non dimostrano di aver consultato il contenuto. Non derivarne esercizi,
codice o istruzioni attribuite al docente. Un esempio personale va etichettato
come tale. Un corso Unity 2D non implica Blender o una riscrittura ECS.

## Scegliere cosa imparare e cosa delegare

Si può usare **apprendimento** per compiere personalmente un'azione e
**delegata** per affidare una parte all'agente. La scelta vale per ogni passo:
per esempio, preparazione ripetitiva delegata e concetto nuovo esercitato
dall'utente. Non è la modalità del workflow: `proof`, `dry-run` e `production`
descrivono un altro aspetto dell'incarico e restano esplicite quando usate.
Anche il controllo umano rimane distinto: apprendimento pratico richiede
l'utente nel passo; una parte delegata può procedere on-the-loop oppure
fermarsi a un checkpoint in-the-loop concordato nel brief, secondo il
[protocollo comune](agent-execution.md#controllo-dellutente).

In apprendimento, prima del tentativo bastano obiettivo, una piccola azione
e ciò che ci si aspetta di vedere. L'agente usa poi il risultato o l'errore
per spiegare il concetto; non completa preventivamente tutta la soluzione.
Se l'utente chiede una soluzione delegata, la realizza entro lo scope e
spiega come osservarne l'esito. In entrambi i casi, comprensione e giudizio
estetico umano non si deducono dal successo di un comando.

## Una sequenza da compilare per la lezione reale

I prompt seguenti sono modelli operativi del hub, non passi del corso.
Sostituisci i campi con dati reali. Il coordinatore usa
[agent-execution](agent-execution.md) e
[agent-guardrails](../skills/agent-guardrails/SKILL.md), indicando nel brief
ID dei moduli e file da leggere. Per un laboratorio sono normalmente utili
`workspace-scope` e `learning-integrity`; aggiungi gli altri solo quando il
lavoro lo richiede. Ogni incaricato conferma i file consultati, senza
affidarsi alla loro iniezione automatica.

### 1. Dal contenuto al primo passo

Prompt:

> Nel progetto `<root>` preparo la lezione `<titolo e URL>`. Questo è il
> contenuto effettivamente osservato: `<passaggio o riferimento>`. Voglio
> imparare `<obiettivo>` e delegare `<parte, se presente>`. Usa course-lab,
> leggi lo stato corrente e prepara `tasks/<lesson-id>/lesson.md`. Indicami
> la prima azione, cosa dovrebbe diventare visibile e come controllarla.
> Non anticipare le parti che ho scelto di esercitare personalmente.

Il risultato è una scheda con fonte, input, versioni, output attesi e un
primo passo eseguibile. Se il contenuto della lezione non è ancora disponibile,
la scheda lo dichiara e contiene solo preparazione verificabile. Non si
inventa il resto della lezione per riempirla.

### 2. Lavorazione locale in Blender, quando pertinente

Prompt:

> Per il passo `<ID>` uso `<file.blend e versione>` e voglio ottenere
> `<risultato>`. Applica local-art in modalità `<apprendimento/delegata>`.
> Conserva il sorgente e limita gli output a `<percorsi>`. Verifica la versione
> Blender e il contesto attuale prima di indicarmi azioni o nomi della UI.
> Prevedi un controllo visibile di `<forma, proporzioni, UV o materiale>`.

In apprendimento l'utente apre il file indicato, identifica l'oggetto e
svolge la piccola operazione descritta per la sua versione. Per un passo
sulle UV, ad esempio, il controllo può essere osservare distorsioni con
una texture di riferimento; questo è un metodo possibile, non una lezione
attribuita al corso. La scheda registra cosa è davvero visibile prima di
proseguire. In modalità delegata l'agente restituisce il `.blend` e l'eventuale
export verificato. Per un mock locale non servono Higgsfield o Meshy.

Non esiste una CLI universale che sostituisca la UI Blender: azioni manuali,
script locali e MCP hanno verifiche diverse. Se la versione o lo schermo
non sono stati osservati, i nomi dei comandi restano da adattare; non si
attesta un'azione UI dal solo log di uno script.

### 3. Codice e verifica in Unity, quando pertinenti

Prompt:

> Nel progetto Unity `<root/versione>`, il passo `<ID>` deve mostrare
> `<comportamento atteso>`. Gli input sono `<scene, script, asset e versioni>`.
> Usa modalità `<apprendimento/delegata>` e lo scope `<percorsi>`. Mantieni
> l'approccio della lezione osservata. Indica cosa aprire o modificare,
> quale risultato devo vedere e un controllo che distingua corretto da errato.

L'utente o l'incaricato apre il progetto e la scena identificati nella scheda;
osserva l'editor effettivo prima di seguire istruzioni su pannelli o menu.
Un solo incaricato modifica la scena condivisa. Quando si importa un asset,
si controllano il file esatto, scala, pivot e resa previsti dal task; quando
si modifica codice, si controlla il comportamento richiesto. Import, errori
di compilazione e osservazione in esecuzione sono esiti distinti. Non serve
introdurre un framework o un pattern per un esercizio che non lo richiede.

### 4. Confronto, feedback e ripresa

Prompt:

> Nel passo `<ID>` prevedevamo `<atteso>`. Ho osservato `<risultato>` sulla
> versione `<file/revisione>`; l'evidenza disponibile è `<percorso o resoconto>`.
> Spiega la differenza e proponi il prossimo controllo utile. Aggiorna la
> scheda distinguendo ciò che hai osservato direttamente da ciò che riferisco.
> Il mio feedback su chiarezza o gusto è `<feedback, se pertinente>`.

Il coordinatore registra esito, limite e prossimo passo. Per valutare
l'apprendimento può chiedere una previsione o una piccola variazione del
concetto appena provato. Per il gusto raccoglie una preferenza sulla revisione
visibile, senza inventare approvazioni. Il feedback non impone una conferma
per ogni operazione reversibile: i punti utili vengono scelti nel brief.

## Cosa deve contenere ogni passo

| Campo | Informazione necessaria |
|---|---|
| Obiettivo | Capacità da esercitare o risultato da produrre, con motivo |
| Modalità | Apprendimento o delegata; responsabile effettivo |
| Input e output | Percorsi nel checkout reale, scena/oggetto, versione o hash |
| Azione e prompt | Operazione delimitata nel tool/versione osservati |
| Spiegazione del prompt | Perché è formulato così, cosa limita e cosa l'utente può cambiare |
| Risultato atteso | Cambiamento visibile o comportamento riconoscibile |
| Evidenza | File, screenshot, log o osservazione riferita, con revisione |
| Limiti | Cosa non è stato verificato e perché |
| Feedback e ripresa | Giudizio ricevuto, decisione e prossimo passo concreto |
| Variazione | Piccolo cambiamento da provare e confronto del suo effetto |

Per codice, motivare pattern, algoritmi e strutture dati con accessi,
dimensioni e budget pertinenti. Una spiegazione leggibile e una soluzione
proporzionata aiutano l'apprendimento; ottimizzazioni speculative lo rendono
più difficile senza provare un vantaggio.

## Distinguere i limiti

| Categoria | Esempio e risposta utile |
|---|---|
| Hub | Manca una procedura o un ruolo riutilizzabile: documentare la lacuna del hub, preservando lo stato nel progetto. |
| Harness | Il runtime non espone delega, tool o accesso UI: dichiarare la capacità mancante e usare un'alternativa già disponibile nello scope. |
| Autenticazione | Un servizio richiede login o un permesso: identificare il servizio e l'operazione impedita, senza raccogliere credenziali nella scheda. |
| Progetto | Mancano pacchetti, asset o configurazione, oppure c'è un difetto locale: riferire file/versione e risolvere o delimitare quel problema. |
| Apprendimento | Manca il contenuto della lezione, un prerequisito o un tentativo comprensibile: acquisire il passaggio necessario o proporre una prova più piccola. |

Claude Code e OpenCode sono opzioni quando il loro uso offre un vantaggio e
sono disponibili nel contesto, non prerequisiti della lezione. Un problema
di login remoto non blocca automaticamente una mesh locale o un esercizio
di codice. Una scheda completa permette di riprendere il lavoro fra runtime,
ma non trasferisce da sola una conversazione nativa.

Alla chiusura separa risultato dell'esercizio, apprendimento osservato,
progresso nel corso e qualità di produzione. Conserva i controlli mancanti;
non registrare avanzamenti nel corso o successi dell'engine non osservati.
