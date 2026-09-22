# Delega Codex → Claude Code → Higgsfield

Questo è un percorso opzionale, non un prerequisito per tutti gli asset.
Per fallback e mock locali leggere [agent-execution](../agent-execution.md).

Codex prepara l'incarico e verifica la consegna. Claude Code è il processo
delegato che usa Higgsfield MCP; l'utente continua a parlare al coordinatore.
Il login di Claude Code e l'autorizzazione del server Higgsfield sono due
prerequisiti separati. La configurazione Claude in VS Code resta sospesa.

## Verifica osservata il 22 settembre 2026

Una delega di sola discovery è stata eseguita da Codex con Claude Code
2.1.263 e il login claude.ai/Max disponibile nell'ambiente host. Il controllo
nella sandbox non riusciva a vedere tale accesso; la verifica host è riuscita.
La sessione delegata ha riportato il MCP `higgsfield` con stato `needs-auth`
nel messaggio iniziale del runtime e nessun tool Higgsfield disponibile.
Nessuna chiamata MCP e nessuna generazione richieste o eseguite nella prova.
L'uscita 0 del processo prova che Claude ha risposto, non che Higgsfield
fosse pronto o che un concept fosse stato creato.

Per completare una volta l'autorizzazione del server, aprire Claude Code
nel hub (dove `.mcp.json` già dichiara Higgsfield), usare `/mcp` e selezionare
il server Higgsfield per l'autenticazione proposta dal client. Le credenziali
restano gestite da Claude Code; non copiarle nei file del progetto. Vedere la
[procedura MCP di Claude Code](https://code.claude.com/docs/en/mcp#authenticate-with-remote-mcp-servers).

## Chiamata delegata

Nel task del progetto preparare un incarico con obiettivo, input espliciti,
numero di generazioni autorizzate, output richiesto e criteri di verifica.
Passarlo alla CLI tramite stdin, senza interpolare il suo contenuto in un
comando shell. Usare il checkout del progetto come directory di lavoro.

Il profilo MCP fornito esplicitamente contiene soltanto Higgsfield:

```json
{
  "mcpServers": {
    "higgsfield": {
      "type": "http",
      "url": "https://mcp.higgsfield.ai/mcp"
    }
  }
}
```

La chiamata della verifica ha usato `--strict-mcp-config`, un file con questo
profilo, `--setting-sources ''`, `--settings '{"disableAllHooks":true}'`,
`--tools ''`, `--permission-mode dontAsk`, `--no-session-persistence`,
`--max-turns 2` e output `stream-json` con `--verbose`.
Il prompt vietava chiamate ai tool e chiedeva soltanto la loro disponibilità.

Per la produzione il coordinatore dovrà abilitare esplicitamente i tool MCP
necessari e assegnare un limite di turni adeguato. Quel percorso non è ancora
collaudato: non usare i flag della discovery come se avessero già verificato
una generazione. Non abilitare indiscriminatamente shell o bypass dei permessi.

Il coordinatore registra esecutore/sessione, stato MCP osservato, tool
effettivamente chiamati, risultato ed eventuali errori. Il testo finale del
modello va confrontato con gli eventi e i file reali. Un risultato incompleto
o `needs-auth` blocca la fase grafica, conservando il lavoro dell'altro ramo.

Il servizio usa [OAuth e crediti Higgsfield](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp).
La [pipeline degli asset](concept-to-unity.md) descrive la consegna del concept
a Meshy e le verifiche successive.
