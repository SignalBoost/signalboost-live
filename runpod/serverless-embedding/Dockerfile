FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    EMBEDDING_MODEL_CACHE=/models/cache \
    PORT=8000 \
    PORT_HEALTH=8000

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Pre-cache the current managed embedding model so normal Production cold starts do not have to
# download weights. Runtime EMBEDDING_MODEL may still select another model; activation is guarded
# by exact live-model identity before traffic is moved.
RUN python - <<'PY'
from sentence_transformers import SentenceTransformer
SentenceTransformer('BAAI/bge-base-en-v1.5', cache_folder='/models/cache')
PY

COPY app.py ./app.py

LABEL org.opencontainers.image.source="https://github.com/SignalBoost/signalboost-live"
LABEL org.opencontainers.image.description="iTMounts RunPod Serverless embedding primary"

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
