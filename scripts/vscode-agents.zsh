#!/bin/zsh -f
# Istanza VS Code dedicata al hub; le credenziali restano nell'ambiente.
set +x
set -euo pipefail

agents_root="${0:A:h:h}"
agents_code="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
agents_data="$HOME/Library/Application Support/Code-Games-Agents"
agents_extensions="$agents_data/extensions"
agents_shared="$agents_data/shared"
agents_mode="${1:---agents}"

case "$agents_mode" in
  --agents|--editor|--claude|--init|--check) ;;
  *)
    print -u2 'Uso: zsh scripts/vscode-agents.zsh [--agents|--editor|--claude|--init|--check]'
    exit 2
    ;;
esac

[[ -x "$agents_code" ]] || { print -u2 "VS Code non trovato: $agents_code"; exit 1; }

agents_running=false
# VS Code registra il PID principale in code.lock; non leggere ambienti o token.
if [[ -f "$agents_data/code.lock" ]]; then
  agents_pid="$(<"$agents_data/code.lock")"
  if [[ "$agents_pid" == <-> ]]; then
    if agents_process="$(/bin/ps -p "$agents_pid" -o command= 2>/dev/null)"; then
      case "$agents_process" in
        *'/Visual Studio Code.app/Contents/MacOS/'*"--user-data-dir $agents_data"*|*'/Visual Studio Code.app/Contents/MacOS/'*"--user-data-dir=$agents_data"*)
          agents_running=true
          ;;
      esac
    elif kill -0 "$agents_pid" 2>/dev/null; then
      print -u2 'Il processo registrato è attivo, ma non è stato possibile identificarlo.'
      exit 1
    fi
  fi
  unset agents_pid agents_process
fi

if [[ "$agents_mode" == --check ]]; then
  print -r -- "Progetto: $agents_root"
  print -r -- "Dati VS Code: $agents_data"
  print -r -- "Istanza dedicata attiva: $agents_running"
  if [[ -f "$agents_data/User/settings.json" ]]; then
    print 'Configurazione dedicata: presente'
  else
    print 'Configurazione dedicata: da inizializzare al primo avvio'
  fi
  exit 0
fi

if [[ "$agents_mode" == --claude && "$agents_running" == true ]]; then
  print -u2 'Chiudi completamente la sola istanza Games di VS Code (Code → Esci), poi ripeti.'
  print -u2 'Un processo già aperto non riceve il nuovo token dal terminale.'
  exit 1
fi

if [[ ! -f "$agents_data/User/settings.json" ]]; then
  /bin/mkdir -p "$agents_data/User" "$agents_extensions"
  /bin/cat > "$agents_data/User/settings.json" <<'JSON'
{
  "chat.agentHost.codexAgent.enabled": true,
  "chat.agentHost.claudeAgent.enabled": true,
  "chat.agentHost.allowSignedOutWhenUsable": true,
  "chat.editor.codex.preferAgentHost": true,
  "chat.defaultToCopilotHarness": false,
  "chat.editor.preferCopilotHarness": false,
  "workbench.startupEditor": "none",
  "window.title": "Games Agents — ${activeEditorShort}${separator}${rootName}"
}
JSON
fi

if [[ "$agents_mode" == --init ]]; then
  print -r -- "Configurazione pronta: $agents_data"
  exit 0
fi

agents_args=(--user-data-dir "$agents_data" --extensions-dir "$agents_extensions" --shared-data-dir "$agents_shared" --sync off)
if [[ "$agents_mode" == --editor ]]; then
  agents_args+=(--new-window "$agents_root")
else
  # In VS Code 1.138 --agents ignora il percorso posizionale della cartella.
  agents_args+=(--agents)
fi

if [[ "$agents_mode" == --claude ]]; then
  # Evita di testare per errore API a consumo o un provider diverso dal login Max.
  for agents_auth_name in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY; do
    if [[ -n "${(P)agents_auth_name:-}" ]]; then
      print -u2 "Rimuovi $agents_auth_name dall'ambiente di questo terminale prima della prova con l'abbonamento."
      exit 1
    fi
  done
  agents_claude_token="${CLAUDE_CODE_OAUTH_TOKEN:-}"
  if [[ -z "$agents_claude_token" ]]; then
    [[ -t 0 ]] || { print -u2 'Serve un terminale interattivo per inserire il token.'; exit 1; }
    print 'Genera prima il token con: mise run claude-token'
    read -rs 'agents_claude_token?Incolla il token OAuth Claude (input nascosto): '
    print
  fi
  [[ -n "$agents_claude_token" ]] || { print -u2 'Token vuoto: avvio annullato.'; exit 1; }
  CLAUDE_CODE_OAUTH_TOKEN="$agents_claude_token" "$agents_code" "${agents_args[@]}"
  unset agents_claude_token
else
  "$agents_code" "${agents_args[@]}"
fi
