# Checkpoint WIP — 23 settembre 2026

Salvataggio del hub con workflow persistenti, sette adattatori VS Code,
guardrail importabili, produzione locale, percorso didattico e launcher
facoltativi Claude Code/OpenCode. I progetti restano repository separati:
il commit del hub non contiene `projects/`, cache, credenziali o dati nativi
delle sessioni. Il pilot viene salvato in un repository locale dedicato;
le guide del corso in corso di lavorazione restano nel loro progetto.

## Controlli del hub

- `mise run hub:check`: sette ruoli, sei skill, sei guardrail, due contratti,
  un MCP, un workflow e sette adattatori validati.
- `mise run hub:test`: esito finale registrato in `checks.json`.
- `mise run hub:doctor`: tool locali presenti; autenticazione e connessione
  dei server non verificate da questo comando. Differenze fra nomi MCP
  Claude/VS Code ancora riportate esplicitamente.
- Review statica pre-commit: corretta l'esclusione case-insensitive di file
  riservati nel controller. Il test con `.ENV` falliva prima della correzione;
  brief, decisioni ed evidenze con varianti maiuscole sono ora rifiutati.
- Controllati i candidati Git per credenziali evidenti e dati locali.
  È un controllo dei file di questo checkpoint, non una garanzia universale.

`mise run hub:snapshot` confronta [snapshot.json](snapshot.json) con le fonti
del checkpoint. Gli snapshot storici rimangono invariati; i loro comandi
espliciti possono segnalare differenze rispetto a questa revisione.

## Risultato osservato nel pilot

Il progetto locale `projects/prova-3d-pipeline-one/`, task
`hub-target-test-001`, ha raggiunto il checkpoint dopo integration. Grafica
e gameplay sono consegnati; la nuova scena HubTargetTest è stata integrata
da un solo incaricato. Il task conserva brief, tentativi falliti, riprese,
rapporti ed evidenze; il commit non registra un'accettazione del gameplay.

- Blender 5.1.2: sorgente `.blend`, FBX, normali corrette, immagini UV/checker;
  mock da 768 triangoli e tre materiali bersaglio.
- Unity 6000.6.2f1: import reale 2 × 2 × 0,2 m, scena con HUD e bersaglio,
  13 controlli Play Mode con eventi sintetici Input System, compilazione
  riuscita e Console finale senza errori o warning.
- Sono documentati errori intermedi degli script di verifica e ripristino
  delle impostazioni temporanee del banco prova. Il confronto finale
  riporta 78 file preesistenti invariati, compresi gameplay e impostazioni.
- Full Access è stato autorizzato per la diagnostica e, separatamente, per
  la produzione fino al checkpoint. Il caso Unity include anche il riavvio
  Pipeline, quindi non isola l'effetto dei soli permessi.

Attribuzione locale: sessione Agent Host
`c23ab7ed-269d-40f7-9d5e-ba3d2268d1be`, coordinatore runtime
`01a0caf3-4bda-7341-b358-fd191fa3bfbc`, turno di produzione
`01a0cb2a-bee6-7320-96f5-72f9a2e954b9`; integratore
`01a0cb2c-fb12-7d03-b39a-11e6631fdb81`. Turni conclusi e rapporti locali
letti dal maintainer; non è un'attribuzione dedotta dal nome del tool.

## Ancora aperto

Feedback umano e review indipendente finale del pilot; test manuale degli
input; rig/animazioni, ECS/netcode e build standalone; runtime degli
esecutori alternativi e degli altri ruoli; generazione Higgsfield/Meshy;
server MCP degli engine e verifica su altre piattaforme. Nessun push o
pubblicazione è incluso nel checkpoint locale.
