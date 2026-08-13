#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${COS_REASONER_WORKSPACE:-/workspace}"
KEY_FILE="${COS_REASONER_KEY_FILE:-$WORKSPACE/cos-api-key}"
SERVICE_FILE="$WORKSPACE/cos-transcript-service.py"
LOG_FILE="$WORKSPACE/cos-transcript-service.log"
PID_FILE="$WORKSPACE/cos-transcript-service.pid"
VENV="$WORKSPACE/cos-transcript-venv"
PORT="${TRANSCRIPT_SERVICE_PORT:-8888}"

mkdir -p "$WORKSPACE"
umask 077
log() { printf '[cos-transcript] %s\n' "$*"; }

if [[ ! -s "$KEY_FILE" ]]; then
  log "ERROR: $KEY_FILE is missing or empty. Run the existing COS reasoner bootstrap first; this service deliberately reuses the same secret."
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
PORT = int(os.environ.get('TRANSCRIPT_SERVICE_PORT', '8888'))
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
    return hmac.compare_digest(bearer, token)


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

    # youtube-transcript-api v1+ instance interface.
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

    # Compatibility with older static versions.
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
    return jsonify({
        'ok': True,
        'service': 'cos-transcript-service',
        'auth_configured': bool(expected_token()),
        'port': PORT,
    })


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
        print(json.dumps({
            'videoId': video_id,
            'ok': False,
            'blocked': blocked,
            'noCaptions': no_captions,
            'detail': detail,
            'ms': int((time.time() - started) * 1000),
        }), flush=True)
        return jsonify({
            'error': 'ip_blocked_by_youtube' if blocked else ('no_captions' if no_captions else 'fetch_failed'),
            'blocked': blocked,
            'noCaptions': no_captions,
            'detail': detail,
        }), status

    text = re.sub(r'\s+', ' ', text or '').strip()[:MAX_TRANSCRIPT_CHARS]
    if len(text) < 200:
        return jsonify({'error': 'no_captions', 'detail': f'caption text too short ({len(text)} chars)'}), 404

    elapsed = int((time.time() - started) * 1000)
    print(json.dumps({
        'videoId': video_id,
        'ok': True,
        'language': language,
        'characters': len(text),
        'ms': elapsed,
    }), flush=True)
    return jsonify({
        'transcript': text,
        'language': language,
        'characters': len(text),
        'license': 'YouTube caption track fetched in full for COS learning; source URL retained',
    })


if __name__ == '__main__':
    print(json.dumps({'starting': True, 'port': PORT, 'auth_configured': bool(expected_token())}), flush=True)
    app.run(host='0.0.0.0', port=PORT, threaded=True)
PY
chmod 700 "$SERVICE_FILE"

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    log "Stopping existing transcript service PID $old_pid..."
    kill "$old_pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$old_pid" 2>/dev/null || break
      sleep 0.25
    done
    kill -9 "$old_pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi
pkill -f '/workspace/cos-transcript-service.py' 2>/dev/null || true
sleep 1

log "Starting authenticated transcript service on 0.0.0.0:$PORT..."
nohup env \
  TRANSCRIPT_SERVICE_PORT="$PORT" \
  TRANSCRIPT_SERVICE_KEY_FILE="$KEY_FILE" \
  "$VENV/bin/python" "$SERVICE_FILE" >"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done
if [[ "$healthy" != 'true' ]]; then
  log "ERROR: transcript service failed health check. See $LOG_FILE"
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi

unauth_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST "http://127.0.0.1:$PORT/transcript" \
  -H 'content-type: application/json' \
  -d '{"videoId":"invalid"}' || true)"
if [[ "$unauth_status" != '401' ]]; then
  log "ERROR: security check failed; expected HTTP 401 without credentials, got $unauth_status"
  exit 1
fi

auth_key="$(cat "$KEY_FILE")"
auth_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST "http://127.0.0.1:$PORT/transcript" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $auth_key" \
  -d '{"videoId":"x"}' || true)"
if [[ "$auth_status" != '400' ]]; then
  log "ERROR: authenticated contract check failed; expected HTTP 400 for invalid video id, got $auth_status"
  exit 1
fi

log 'COS transcript service is READY.'
log "PID: $(cat "$PID_FILE")"
log "Health: http://127.0.0.1:$PORT/health"
log "Log: $LOG_FILE"
log "Persistent API key: $KEY_FILE (reused; never printed)"

if [[ -n "${RUNPOD_POD_ID:-}" ]]; then
  PUBLIC_BASE="https://${RUNPOD_POD_ID}-${PORT}.proxy.runpod.net"
  log "RunPod health URL: $PUBLIC_BASE/health"
  log "Vercel YOUTUBE_TRANSCRIPT_API_URL = $PUBLIC_BASE/transcript"
  if curl -fsS --max-time 8 "$PUBLIC_BASE/health" >/dev/null 2>&1; then
    log 'RunPod public proxy is reachable.'
  else
    log "WARNING: local service is healthy but the RunPod public proxy did not answer. Ensure HTTP port $PORT is exposed for this pod."
  fi
else
  log "RunPod did not expose RUNPOD_POD_ID to the shell. Use the pod id from the console to form https://<pod-id>-${PORT}.proxy.runpod.net/transcript"
fi

log 'Vercel YOUTUBE_TRANSCRIPT_API_TOKEN must equal the existing LOCAL_AI_API_KEY / contents of /workspace/cos-api-key.'
log 'Vercel YOUTUBE_TRANSCRIPT_LANGUAGES = en,es,pt,pl,ru'
