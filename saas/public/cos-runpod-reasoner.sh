#!/usr/bin/env bash
set -euo pipefail

MODEL="${COS_REASONER_MODEL:-qwen2.5-coder:32b}"
WORKSPACE="${COS_REASONER_WORKSPACE:-/workspace}"
MODEL_DIR="${COS_REASONER_MODEL_DIR:-$WORKSPACE/ollama-models}"
KEY_FILE="${COS_REASONER_KEY_FILE:-$WORKSPACE/cos-api-key}"
GATEWAY_FILE="$WORKSPACE/cos-reasoner-gateway.py"
OLLAMA_LOG="$WORKSPACE/cos-ollama.log"
GATEWAY_LOG="$WORKSPACE/cos-gateway.log"
OLLAMA_PID_FILE="$WORKSPACE/cos-ollama.pid"
GATEWAY_PID_FILE="$WORKSPACE/cos-gateway.pid"

mkdir -p "$WORKSPACE" "$MODEL_DIR"
umask 077
log() { printf '[cos-runpod] %s\n' "$*"; }
wait_http() {
  local url="$1" attempts="${2:-60}" i
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}
stop_pid_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

if ! command -v curl >/dev/null 2>&1; then apt-get update -y && apt-get install -y curl ca-certificates; fi
if ! command -v python3 >/dev/null 2>&1; then apt-get update -y && apt-get install -y python3; fi
if ! command -v openssl >/dev/null 2>&1; then apt-get update -y && apt-get install -y openssl; fi
if ! command -v ollama >/dev/null 2>&1; then
  log 'Installing Ollama into the current RunPod container...'
  curl -fsSL https://ollama.com/install.sh | sh
fi

if [[ ! -s "$KEY_FILE" ]]; then
  openssl rand -hex 32 > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  log "Generated a persistent API key at $KEY_FILE"
else
  chmod 600 "$KEY_FILE"
  log "Using the existing persistent API key at $KEY_FILE"
fi

stop_pid_file "$GATEWAY_PID_FILE"
stop_pid_file "$OLLAMA_PID_FILE"
pkill -f 'ollama serve' 2>/dev/null || true
pkill -f 'cos-reasoner-gateway.py' 2>/dev/null || true
sleep 1

log 'Starting private Ollama on 127.0.0.1:11435...'
nohup env OLLAMA_MODELS="$MODEL_DIR" OLLAMA_HOST="127.0.0.1:11435" OLLAMA_KEEP_ALIVE="10m" ollama serve >"$OLLAMA_LOG" 2>&1 &
echo $! > "$OLLAMA_PID_FILE"
if ! wait_http 'http://127.0.0.1:11435/api/tags' 90; then
  log "ERROR: Ollama did not become healthy. See $OLLAMA_LOG"
  tail -n 50 "$OLLAMA_LOG" || true
  exit 1
fi

if ! OLLAMA_HOST='127.0.0.1:11435' OLLAMA_MODELS="$MODEL_DIR" ollama list | awk 'NR>1 {print $1}' | grep -Fxq "$MODEL"; then
  log "Model $MODEL is not present in persistent storage; pulling it now..."
  OLLAMA_HOST='127.0.0.1:11435' OLLAMA_MODELS="$MODEL_DIR" ollama pull "$MODEL"
else
  log "Model $MODEL is already present in persistent storage."
fi

cat > "$GATEWAY_FILE" <<'PY'
#!/usr/bin/env python3
import hmac, http.client, json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
KEY_FILE = os.environ.get('COS_REASONER_KEY_FILE', '/workspace/cos-api-key')
UPSTREAM_HOST = '127.0.0.1'
UPSTREAM_PORT = 11435
with open(KEY_FILE, 'r', encoding='utf-8') as fh:
    EXPECTED = fh.read().strip()
if not EXPECTED:
    raise SystemExit('COS reasoner API key file is empty')
class Handler(BaseHTTPRequestHandler):
    server_version = 'SignalBoostCOSReasoner/1.0'
    def log_message(self, fmt, *args): print('[cos-gateway] ' + (fmt % args), flush=True)
    def _authorized(self):
        api_key = self.headers.get('x-api-key', '')
        auth = self.headers.get('authorization', '')
        bearer = auth[7:].strip() if auth.lower().startswith('bearer ') else ''
        return hmac.compare_digest(api_key, EXPECTED) or hmac.compare_digest(bearer, EXPECTED)
    def _reject(self):
        body = json.dumps({'error':'unauthorized'}).encode()
        self.send_response(401); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def _proxy(self):
        if not self._authorized(): return self._reject()
        length = int(self.headers.get('content-length','0') or '0')
        body = self.rfile.read(length) if length else None
        headers = {'Host': f'{UPSTREAM_HOST}:{UPSTREAM_PORT}'}
        if self.headers.get('content-type'): headers['Content-Type'] = self.headers['content-type']
        conn = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=300)
        try:
            conn.request(self.command, self.path, body=body, headers=headers)
            response = conn.getresponse(); payload = response.read()
            self.send_response(response.status)
            content_type = response.getheader('content-type')
            if content_type: self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)
        except Exception as exc:
            payload = json.dumps({'error':'upstream_unavailable','detail':str(exc)}).encode()
            self.send_response(502); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload)
        finally: conn.close()
    do_GET = _proxy
    do_POST = _proxy
if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0',11434), Handler)
    print('[cos-gateway] listening on 0.0.0.0:11434; upstream 127.0.0.1:11435', flush=True)
    server.serve_forever()
PY
chmod 700 "$GATEWAY_FILE"
log 'Starting authenticated public gateway on 0.0.0.0:11434...'
nohup env COS_REASONER_KEY_FILE="$KEY_FILE" python3 "$GATEWAY_FILE" >"$GATEWAY_LOG" 2>&1 &
echo $! > "$GATEWAY_PID_FILE"
sleep 1

if ! kill -0 "$(cat "$GATEWAY_PID_FILE")" 2>/dev/null; then
  log "ERROR: authenticated gateway failed to start. See $GATEWAY_LOG"
  cat "$GATEWAY_LOG" || true
  exit 1
fi
unauth_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:11434/v1/models || true)"
if [[ "$unauth_status" != '401' ]]; then
  log "ERROR: gateway security check failed; expected HTTP 401 without credentials, got $unauth_status"
  exit 1
fi
auth_key="$(cat "$KEY_FILE")"
models_json="$(curl -fsS --max-time 15 -H "x-api-key: $auth_key" http://127.0.0.1:11434/v1/models)"
if ! printf '%s' "$models_json" | grep -Fq "$MODEL"; then
  log "ERROR: authenticated gateway is healthy but model $MODEL was not returned by /v1/models"
  exit 1
fi
log 'COS independent reasoner is READY.'
log "Model: $MODEL"
log "Persistent models: $MODEL_DIR"
log "Persistent API key: $KEY_FILE"
log 'Public RunPod port: 11434'
log 'Vercel LOCAL_AI_BASE_URL = your RunPod 11434 proxy URL plus /v1'
log 'Vercel LOCAL_AI_ALLOWED_HOSTS = exact hostname from that proxy URL'
log 'Vercel LOCAL_AI_API_KEY = secret stored in /workspace/cos-api-key'
log 'Do not paste that key into chat, GitHub, logs, or source code.'
