#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${COS_REASONER_WORKSPACE:-/workspace}"
KEY_FILE="${COS_REASONER_KEY_FILE:-$WORKSPACE/cos-api-key}"
SERVICE_FILE="$WORKSPACE/cos-transcript-service.py"
LOG_FILE="$WORKSPACE/cos-transcript-service.log"
PID_FILE="$WORKSPACE/cos-transcript-service.pid"
VENV="$WORKSPACE/cos-transcript-venv"
PORT="${TRANSCRIPT_SERVICE_PORT:-18888}"
GATEWAY_FILE="$WORKSPACE/cos-reasoner-gateway.py"
GATEWAY_LOG="$WORKSPACE/cos-gateway.log"
GATEWAY_PID_FILE="$WORKSPACE/cos-gateway.pid"
GATEWAY_BACKUP="$WORKSPACE/cos-reasoner-gateway.py.pre-transcript"
GATEWAY_TEMP="$WORKSPACE/cos-reasoner-gateway.py.next"

mkdir -p "$WORKSPACE"
umask 077
log() { printf '[cos-transcript] %s\n' "$*"; }

if [[ ! -s "$KEY_FILE" ]]; then
  log "ERROR: $KEY_FILE is missing or empty. Run the existing COS reasoner bootstrap first."
  exit 1
fi
chmod 600 "$KEY_FILE"

if ! command -v python3 >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y python3 python3-venv
fi
if ! command -v curl >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y curl ca-certificates
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  log "Creating isolated Python environment at $VENV..."
  if ! python3 -m venv "$VENV" >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y python3-venv
    python3 -m venv "$VENV"
  fi
fi

log 'Installing/updating transcript dependencies in the isolated environment...'
"$VENV/bin/python" -m pip install --disable-pip-version-check --quiet --upgrade pip
"$VENV/bin/python" -m pip install --disable-pip-version-check --quiet flask youtube-transcript-api

cat > "$SERVICE_FILE" <<'PY'
#!/usr/bin/env python3
import hmac
import json
import os
import re
import time
from urllib.parse import parse_qs, urlparse

from flask import Flask, jsonify, request

app = Flask(__name__)
PORT = int(os.environ.get('TRANSCRIPT_SERVICE_PORT', '18888'))
MAX_TRANSCRIPT_CHARS = int(os.environ.get('TRANSCRIPT_MAX_CHARS', '200000'))
KEY_FILE = os.environ.get('TRANSCRIPT_SERVICE_KEY_FILE', '/workspace/cos-api-key')
VIDEO_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{6,20}$')


def expected_token():
    override = os.environ.get('TRANSCRIPT_SERVICE_TOKEN', '').strip()
    if override:
        return override
    try:
        with open(KEY_FILE, 'r', encoding='utf-8') as handle:
            return handle.read().strip()
    except OSError:
        return ''


def authorized(req):
    token = expected_token()
    if not token:
        return False
    auth = req.headers.get('authorization', '')
    bearer = auth[7:].strip() if auth.lower().startswith('bearer ') else ''
    api_key = req.headers.get('x-api-key', '').strip()
    return hmac.compare_digest(bearer, token) or hmac.compare_digest(api_key, token)


def video_id_from(payload):
    candidate = str(payload.get('videoId') or '').strip()
    if not candidate:
        raw_url = str(payload.get('videoUrl') or '').strip()
        if raw_url:
            parsed = urlparse(raw_url)
            host = (parsed.hostname or '').lower()
            if host in ('youtu.be', 'www.youtu.be'):
                candidate = parsed.path.lstrip('/').split('/')[0]
            elif host in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
                candidate = (parse_qs(parsed.query).get('v') or [''])[0]
    return candidate if VIDEO_ID_PATTERN.fullmatch(candidate or '') else ''


def requested_languages(payload):
    raw = payload.get('languages')
    if isinstance(raw, list):
        langs = [str(item).strip() for item in raw if str(item).strip()]
        if langs:
            return langs[:8]
    return ['en']


def snippets_to_text(snippets):
    parts = []
    for snippet in snippets:
        text = getattr(snippet, 'text', None)
        if text is None and isinstance(snippet, dict):
            text = snippet.get('text')
        if text:
            parts.append(str(text))
    return ' '.join(parts)


def fetch_transcript(video_id, languages):
    from youtube_transcript_api import YouTubeTranscriptApi

    if hasattr(YouTubeTranscriptApi, 'fetch'):
        api = YouTubeTranscriptApi()
        try:
            fetched = api.fetch(video_id, languages=languages)
            return snippets_to_text(fetched), getattr(fetched, 'language_code', languages[0])
        except Exception as preferred_error:
            try:
                listing = api.list(video_id)
                for transcript in listing:
                    fetched = transcript.fetch()
                    return snippets_to_text(fetched), getattr(transcript, 'language_code', 'unknown')
            except Exception:
                raise preferred_error
            raise preferred_error

    try:
        data = YouTubeTranscriptApi.get_transcript(video_id, languages=languages)
        return snippets_to_text(data), languages[0]
    except Exception as preferred_error:
        try:
            listing = YouTubeTranscriptApi.list_transcripts(video_id)
            for transcript in listing:
                data = transcript.fetch()
                return snippets_to_text(data), getattr(transcript, 'language_code', 'unknown')
        except Exception:
            raise preferred_error
        raise preferred_error


def classify_failure(error):
    name = type(error).__name__
    detail = f'{name}: {error}'
    blocked = any(marker.lower() in detail.lower() for marker in (
        'IpBlocked', 'RequestBlocked', 'TooManyRequests', '429', '403', 'Forbidden'
    ))
    no_captions = any(marker.lower() in name.lower() for marker in (
        'TranscriptsDisabled', 'NoTranscriptFound', 'NoTranscriptAvailable', 'VideoUnavailable'
    ))
    return blocked, no_captions, detail[:400]


@app.get('/health')
def health():
    return jsonify({'ok': True, 'service': 'cos-transcript-service', 'auth_configured': bool(expected_token()), 'port': PORT})


@app.post('/transcript')
def transcript():
    if not authorized(request):
        return jsonify({'error': 'unauthorized'}), 401
    payload = request.get_json(silent=True) or {}
    video_id = video_id_from(payload)
    if not video_id:
        return jsonify({'error': 'missing or invalid videoId/videoUrl'}), 400

    started = time.time()
    try:
        text, language = fetch_transcript(video_id, requested_languages(payload))
    except Exception as error:
        blocked, no_captions, detail = classify_failure(error)
        status = 429 if blocked else (404 if no_captions else 502)
        print(json.dumps({'videoId': video_id, 'ok': False, 'blocked': blocked, 'noCaptions': no_captions, 'detail': detail, 'ms': int((time.time() - started) * 1000)}), flush=True)
        return jsonify({'error': 'ip_blocked_by_youtube' if blocked else ('no_captions' if no_captions else 'fetch_failed'), 'blocked': blocked, 'noCaptions': no_captions, 'detail': detail}), status

    text = re.sub(r'\s+', ' ', text or '').strip()[:MAX_TRANSCRIPT_CHARS]
    if len(text) < 200:
        return jsonify({'error': 'no_captions', 'detail': f'caption text too short ({len(text)} chars)'}), 404

    elapsed = int((time.time() - started) * 1000)
    print(json.dumps({'videoId': video_id, 'ok': True, 'language': language, 'characters': len(text), 'ms': elapsed}), flush=True)
    return jsonify({'transcript': text, 'language': language, 'characters': len(text), 'license': 'YouTube caption track fetched in full for COS learning; source URL retained'})


if __name__ == '__main__':
    print(json.dumps({'starting': True, 'port': PORT, 'auth_configured': bool(expected_token())}), flush=True)
    app.run(host='127.0.0.1', port=PORT, threaded=True)
PY
chmod 700 "$SERVICE_FILE"

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    log "Stopping existing transcript service PID $old_pid..."
    kill "$old_pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$old_pid" 2>/dev/null || break; sleep 0.25; done
    kill -9 "$old_pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi
pkill -f '/workspace/cos-transcript-service.py' 2>/dev/null || true
sleep 1

if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${PORT}$"; then
  log "ERROR: private transcript port $PORT is already occupied. Set TRANSCRIPT_SERVICE_PORT to another unused loopback port."
  exit 1
fi

log "Starting private transcript service on 127.0.0.1:$PORT..."
nohup env TRANSCRIPT_SERVICE_PORT="$PORT" TRANSCRIPT_SERVICE_KEY_FILE="$KEY_FILE" \
  "$VENV/bin/python" "$SERVICE_FILE" >"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" != 'true' ]]; then
  log "ERROR: transcript service failed health check. See $LOG_FILE"
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi

auth_key="$(cat "$KEY_FILE")"
internal_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST "http://127.0.0.1:$PORT/transcript" \
  -H 'content-type: application/json' -H "authorization: Bearer $auth_key" \
  -d '{"videoId":"x"}' || true)"
if [[ "$internal_status" != '400' ]]; then
  log "ERROR: private transcript contract check failed; expected HTTP 400, got $internal_status"
  exit 1
fi

if [[ ! -f "$GATEWAY_FILE" ]]; then
  log "ERROR: $GATEWAY_FILE is missing; the COS reasoner gateway must exist before transcript routing can be added."
  exit 1
fi
cp -f "$GATEWAY_FILE" "$GATEWAY_BACKUP"

cat > "$GATEWAY_TEMP" <<PY
#!/usr/bin/env python3
import hmac, http.client, json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
KEY_FILE = os.environ.get('COS_REASONER_KEY_FILE', '/workspace/cos-api-key')
OLLAMA_HOST = '127.0.0.1'
OLLAMA_PORT = 11435
TRANSCRIPT_HOST = '127.0.0.1'
TRANSCRIPT_PORT = int(os.environ.get('COS_TRANSCRIPT_INTERNAL_PORT', '${PORT}'))
with open(KEY_FILE, 'r', encoding='utf-8') as fh:
    EXPECTED = fh.read().strip()
if not EXPECTED:
    raise SystemExit('COS reasoner API key file is empty')
class Handler(BaseHTTPRequestHandler):
    server_version = 'SignalBoostCOSGateway/2.0'
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
        transcript = self.path == '/transcript' or self.path == '/transcript-health'
        host = TRANSCRIPT_HOST if transcript else OLLAMA_HOST
        port = TRANSCRIPT_PORT if transcript else OLLAMA_PORT
        path = '/health' if self.path == '/transcript-health' else self.path
        length = int(self.headers.get('content-length','0') or '0')
        body = self.rfile.read(length) if length else None
        headers = {'Host': f'{host}:{port}'}
        if self.headers.get('content-type'): headers['Content-Type'] = self.headers['content-type']
        if transcript:
            headers['Authorization'] = f'Bearer {EXPECTED}'
        conn = http.client.HTTPConnection(host, port, timeout=300)
        try:
            conn.request(self.command, path, body=body, headers=headers)
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
    print(f'[cos-gateway] listening on 0.0.0.0:11434; ollama={OLLAMA_HOST}:{OLLAMA_PORT}; transcript={TRANSCRIPT_HOST}:{TRANSCRIPT_PORT}', flush=True)
    server.serve_forever()
PY
chmod 700 "$GATEWAY_TEMP"
python3 -m py_compile "$GATEWAY_TEMP"

old_gateway_pid=""
if [[ -f "$GATEWAY_PID_FILE" ]]; then old_gateway_pid="$(cat "$GATEWAY_PID_FILE" 2>/dev/null || true)"; fi
if [[ -n "$old_gateway_pid" ]] && kill -0 "$old_gateway_pid" 2>/dev/null; then
  log "Restarting only the authenticated gateway (Ollama stays running)..."
  kill "$old_gateway_pid" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$old_gateway_pid" 2>/dev/null || break; sleep 0.25; done
  kill -9 "$old_gateway_pid" 2>/dev/null || true
else
  pkill -f '/workspace/cos-reasoner-gateway.py' 2>/dev/null || true
fi
mv -f "$GATEWAY_TEMP" "$GATEWAY_FILE"
nohup env COS_REASONER_KEY_FILE="$KEY_FILE" COS_TRANSCRIPT_INTERNAL_PORT="$PORT" \
  python3 "$GATEWAY_FILE" >"$GATEWAY_LOG" 2>&1 &
echo $! > "$GATEWAY_PID_FILE"
sleep 1

rollback_gateway() {
  log 'Gateway verification failed; restoring the previous gateway.'
  current="$(cat "$GATEWAY_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$current" ]] && kill -0 "$current" 2>/dev/null; then kill "$current" 2>/dev/null || true; sleep 1; fi
  cp -f "$GATEWAY_BACKUP" "$GATEWAY_FILE"
  nohup env COS_REASONER_KEY_FILE="$KEY_FILE" python3 "$GATEWAY_FILE" >"$GATEWAY_LOG" 2>&1 &
  echo $! > "$GATEWAY_PID_FILE"
  sleep 1
}

unauth_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:11434/v1/models || true)"
if [[ "$unauth_status" != '401' ]]; then rollback_gateway; log "ERROR: gateway auth check failed; got $unauth_status"; exit 1; fi
models_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -H "x-api-key: $auth_key" http://127.0.0.1:11434/v1/models || true)"
if [[ "$models_status" != '200' ]]; then rollback_gateway; log "ERROR: reasoner route failed after gateway patch; got $models_status"; exit 1; fi
transcript_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST http://127.0.0.1:11434/transcript \
  -H 'content-type: application/json' -H "authorization: Bearer $auth_key" \
  -d '{"videoId":"x"}' || true)"
if [[ "$transcript_status" != '400' ]]; then rollback_gateway; log "ERROR: transcript gateway route failed; got $transcript_status"; exit 1; fi

log 'COS transcript service is READY.'
log "Private service: 127.0.0.1:$PORT"
log 'Public transcript route: existing RunPod port 11434 at /transcript'
log 'No new RunPod port is required; Jupyter can keep port 8888.'
log 'The existing COS API key is reused and was not printed.'
