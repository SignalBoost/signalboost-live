import os
from typing import List, Union

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

MODEL_ID = os.getenv("EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5").strip()
MODEL_CACHE = os.getenv("EMBEDDING_MODEL_CACHE", "/models/cache")
BATCH_LIMIT = max(1, min(64, int(os.getenv("EMBEDDING_BATCH_LIMIT", "32"))))

app = FastAPI(title="iTMounts RunPod Embedding Worker", version="1.0")
model = SentenceTransformer(MODEL_ID, cache_folder=MODEL_CACHE, device="cuda" if torch.cuda.is_available() else "cpu")


class EmbeddingRequest(BaseModel):
    model: str
    input: Union[str, List[str]]


@app.get("/ping")
def ping():
    return {"status": "healthy", "model": MODEL_ID}


@app.post("/v1/embeddings")
def embeddings(request: EmbeddingRequest):
    if request.model != MODEL_ID:
        raise HTTPException(status_code=400, detail="model_mismatch")

    texts = [request.input] if isinstance(request.input, str) else list(request.input)
    if not texts or len(texts) > BATCH_LIMIT:
        raise HTTPException(status_code=400, detail="invalid_batch_size")
    if any(not isinstance(text, str) or not text.strip() for text in texts):
        raise HTTPException(status_code=400, detail="invalid_embedding_input")

    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )

    return {
        "object": "list",
        "model": MODEL_ID,
        "data": [
            {"object": "embedding", "index": index, "embedding": vector.tolist()}
            for index, vector in enumerate(vectors)
        ],
        "usage": {"prompt_tokens": 0, "total_tokens": 0},
    }
