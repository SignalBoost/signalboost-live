# /workspace/cos-transcript-service.py
#
# WHY THIS EXISTS. COS's learning pipeline has had a real transcript path since Option A
# shipped: liveSources.ts uses createYouTubeTranscriptSearch INSTEAD of the metadata client
# whenever YOUTUBE_TRANSCRIPT_API_URL is set. It has never been set, because there was no
# service behind it — so every "video_transcript" row in cos_continuous_learning is actually
# title + description (~161 chars average, measured Aug 13 2026), stored under a kind label
# that promises content it does not have. This file is the missing service.
#
# It runs ON THE RUNPOD POD, next to Ollama, because the pod already exists, already has an
# exposed spare port (8888), and already holds the shared secret (/workspace/cos-api-key) —
# no new infrastructure, no new bill.
#
# THE CONTRACT (verified against saas/lib/cos-core/layers/learning/mediaClients.ts, not
# guessed): the platform POSTs {videoId, videoUrl, languages} with an optional
# "Authorization: Bearer <token>" header, and accepts any of {transcript: "..."} or
# {text: "..."} or {segments: [{text}]}, plus an optional license string. This service
# returns {transcript, license, language, characters}.
#
# INSTALL AND RUN (RunPod web terminal):
#   pip install flask youtube-transcript-api
#   nohup python /workspace/cos-transcript-service.py > /workspace/transcript-service.log 2>&1 &
#
# VERCEL ENV (then redeploy):
#   YOUTUBE_TRANSCRIPT_API_URL   = https://<pod-id>-8888.proxy.runpod.net/transcript
#   YOUTUBE_TRANSCRIPT_API_TOKEN = <contents of /workspace/cos-api-key>
#   YOUTUBE_TRANSCRIPT_LANGUAGES = en,es,pt,pl,ru        (optional; en is the default)
#   (YOUTUBE_API_KEY must already be set — discovery still needs it.)
#
# HONEST LIMITATION, stated up front: YouTube rate-limits and sometimes blocks datacenter
# IP ranges. If most requests come back blocked=true in the log, the pod's IP is burned for
# this purpose and the options are a residential proxy or a paid transcript API — this
# service reports that condition plainly rather than pretending videos have no captions.

import ipaddress
import json
import os
import re
import socket
import time
from urllib.parse import urlparse

from flask import Flask, jsonify, request

app = Flask(__name__)

PORT = int(os.environ.get("TRANSCRIPT_SERVICE_PORT", "8888"))
MAX_TRANSCRIPT_CHARS = int(os.environ.get("TRANSCRIPT_MAX_CHARS", "200000"))
KEY_FILE = os.environ.get("TRANSCRIPT_SERVICE_KEY_FILE", "/workspace/cos-api-key")

VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


def expected_token() -> str:
    """The same 256-bit key the Ollama gateway uses, so there is ONE secret on this pod.
    Explicit env override wins; an unreadable key file means auth is REQUIRED and impossible,
    never silently open."""
    override = os.environ.get("TRANSCRIPT_SERVICE_TOKEN", "").strip()
    if override:
        return override
    try:
        with open(KEY_FILE, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def authorized(req) -> bool:
    token = expected_token()
    if not token:
        # Fail closed. A service that quietly runs unauthenticated on a public proxy URL is
        # exactly the kind of silent exposure this platform has already been burned by.
        return False
    header = req.headers.get("authorization", "")
    return header == f"Bearer {token}"


def video_id_from(payload: dict) -> str:
    """Prefer the explicit videoId; fall back to parsing the URL. Reject anything that does
    not look like a YouTube id so this service can never be used as a generic fetcher."""
    candidate = str(payload.get("videoId") or "").strip()
    if not candidate:
        url = str(payload.get("videoUrl") or "").strip()
        if url:
            parsed = urlparse(url)
            if parsed.hostname and parsed.hostname.endswith(("youtube.com", "youtu.be")):
                if parsed.hostname.endswith("youtu.be"):
                    candidate = parsed.path.lstrip("/")
                else:
                    match = re.search(r"[?&]v=([A-Za-z0-9_-]{6,20})", url)
                    candidate = match.group(1) if match else ""
    return candidate if VIDEO_ID_PATTERN.match(candidate or "") else ""


def requested_languages(payload: dict) -> list:
    raw = payload.get("languages")
    langs = [str(item).strip() for item in raw if str(item).strip()] if isinstance(raw, list) else []
    return langs or ["en"]


def fetch_transcript(video_id: str, languages: list):
    """Supports both youtube-transcript-api generations: v1+ instance API
    (YouTubeTranscriptApi().fetch) and the older static get_transcript. Tries the requested
    languages first, then ANY available transcript — a Polish talk with only Polish captions
    is still content, and the relevance gate downstream judges usefulness, not this service."""
    from youtube_transcript_api import YouTubeTranscriptApi

    def snippets_to_text(snippets):
        parts = []
        for snippet in snippets:
            text = getattr(snippet, "text", None)
            if text is None and isinstance(snippet, dict):
                text = snippet.get("text")
            if text:
                parts.append(str(text))
        return " ".join(parts)

    if hasattr(YouTubeTranscriptApi, "list"):  # v1+ instance API
        api = YouTubeTranscriptApi()
        try:
            fetched = api.fetch(video_id, languages=languages)
            return snippets_to_text(fetched), getattr(fetched, "language_code", languages[0])
        except Exception:
            transcript_list = api.list(video_id)
            for transcript in transcript_list:
                fetched = transcript.fetch()
                return snippets_to_text(fetched), getattr(transcript, "language_code", "unknown")
            raise
    # legacy static API
    try:
        data = YouTubeTranscriptApi.get_transcript(video_id, languages=languages)
        return snippets_to_text(data), languages[0]
    except Exception:
        listing = YouTubeTranscriptApi.list_transcripts(video_id)
        for transcript in listing:
            data = transcript.fetch()
            return snippets_to_text(data), getattr(transcript, "language_code", "unknown")
        raise


def classify_failure(error: Exception):
    """Name the failure honestly. 'No captions' and 'YouTube is blocking this IP' need
    opposite responses from the operator, so they must not share an error message."""
    name = type(error).__name__
    text = f"{name}: {error}"
    blocked = any(marker in text for marker in ("IpBlocked", "RequestBlocked", "TooManyRequests", "429", "403", "Forbidden"))
    no_captions = any(marker in name for marker in ("TranscriptsDisabled", "NoTranscriptFound", "NoTranscriptAvailable", "VideoUnavailable"))
    return blocked, no_captions, text[:400]


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "cos-transcript-service", "auth_configured": bool(expected_token())})


@app.route("/transcript", methods=["POST"])
def transcript():
    if not authorized(request):
        return jsonify({"error": "unauthorized"}), 401
    payload = request.get_json(silent=True) or {}
    video_id = video_id_from(payload)
    if not video_id:
        return jsonify({"error": "missing or invalid videoId/videoUrl"}), 400

    started = time.time()
    try:
        text, language = fetch_transcript(video_id, requested_languages(payload))
    except Exception as error:  # noqa: BLE001 — every failure must become an honest JSON body
        blocked, no_captions, detail = classify_failure(error)
        status = 429 if blocked else (404 if no_captions else 502)
        print(json.dumps({"videoId": video_id, "ok": False, "blocked": blocked, "noCaptions": no_captions, "detail": detail, "ms": int((time.time() - started) * 1000)}), flush=True)
        return jsonify({"error": "ip_blocked_by_youtube" if blocked else ("no_captions" if no_captions else "fetch_failed"), "detail": detail}), status

    text = re.sub(r"\s+", " ", text or "").strip()[:MAX_TRANSCRIPT_CHARS]
    if len(text) < 200:
        # Shorter than this is a caption fragment, not a transcript — returning it would
        # recreate the blurbs-as-knowledge problem this service exists to end.
        return jsonify({"error": "no_captions", "detail": f"caption text too short ({len(text)} chars)"}), 404

    print(json.dumps({"videoId": video_id, "ok": True, "language": language, "characters": len(text), "ms": int((time.time() - started) * 1000)}), flush=True)
    return jsonify({
        "transcript": text,
        "language": language,
        "characters": len(text),
        "license": "YouTube caption track fetched in full for COS learning; source URL retained",
    })


if __name__ == "__main__":
    print(json.dumps({"starting": True, "port": PORT, "auth_configured": bool(expected_token())}), flush=True)
    app.run(host="0.0.0.0", port=PORT)
