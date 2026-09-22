import asyncio
import json
import os
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from huggingface_hub import snapshot_download

BASE_ID = os.environ["ITMOUNTS_BASE_MODEL_ID"]
BASE_REV = os.environ["ITMOUNTS_BASE_MODEL_REVISION"]
ADAPTER_ID = os.environ["ITMOUNTS_ADAPTER_MODEL_ID"]
ADAPTER_REV = os.environ["ITMOUNTS_ADAPTER_MODEL_REVISION"]
MODEL = os.environ["ITMOUNTS_DISTILLED_MODEL_NAME"]
TOKEN = os.environ["HF_TOKEN"]
INTERNAL_PORT = 8001
PUBLIC_PORT = int(os.environ.get("PORT", "8000"))

app = FastAPI(title="iTMounts exact-artifact canary gateway", version="1.0")
ready = asyncio.Event()
bootstrap_error: str | None = None
proc = None


def cached_base() -> str | None:
    org, name = BASE_ID.split("/", 1)
    path = (
        Path("/runpod-volume/huggingface-cache/hub")
        / f"models--{org}--{name}"
        / "snapshots"
        / BASE_REV
    )
    return str(path) if path.is_dir() else None


async def bootstrap() -> None:
    global bootstrap_error, proc
    try:
        Path("/models/base").mkdir(parents=True, exist_ok=True)
        Path("/models/adapter").mkdir(parents=True, exist_ok=True)
        base = cached_base() or await asyncio.to_thread(
            snapshot_download,
            repo_id=BASE_ID,
            revision=BASE_REV,
            local_dir="/models/base",
            token=TOKEN,
        )
        adapter = await asyncio.to_thread(
            snapshot_download,
            repo_id=ADAPTER_ID,
            revision=ADAPTER_REV,
            local_dir="/models/adapter",
            token=TOKEN,
        )
        lora = json.dumps({"name": MODEL, "path": adapter, "base_model_name": BASE_ID})
        proc = await asyncio.create_subprocess_exec(
            "vllm",
            "serve",
            base,
            "--host",
            "127.0.0.1",
            "--port",
            str(INTERNAL_PORT),
            "--served-model-name",
            BASE_ID,
            "--enable-lora",
            "--max-lora-rank",
            "16",
            "--max-loras",
            "1",
            "--max-cpu-loras",
            "1",
            "--lora-modules",
            lora,
            "--gpu-memory-utilization",
            "0.85",
            "--max-model-len",
            "8192",
            "--dtype",
            "auto",
            "--enforce-eager",
        )
        async with httpx.AsyncClient(timeout=2.0) as client:
            for _ in range(300):
                if proc.returncode is not None:
                    raise RuntimeError(f"vllm_exited_{proc.returncode}")
                try:
                    response = await client.get(f"http://127.0.0.1:{INTERNAL_PORT}/health")
                    if response.status_code == 200:
                        ready.set()
                        return
                except Exception:
                    pass
                await asyncio.sleep(1)
        raise TimeoutError("vllm_internal_health_timeout")
    except Exception as exc:
        bootstrap_error = f"{type(exc).__name__}:{str(exc)[:240]}"


@app.on_event("startup")
async def start() -> None:
    asyncio.create_task(bootstrap())


@app.get("/ping")
async def ping():
    if bootstrap_error:
        raise HTTPException(status_code=503, detail=f"distilled_bootstrap_failed:{bootstrap_error}")
    if not ready.is_set():
        return Response(status_code=204)
    return {"status": "ready", "modelReady": True, "model": MODEL}


@app.get("/ready")
async def is_ready():
    if bootstrap_error:
        raise HTTPException(status_code=503, detail=f"distilled_bootstrap_failed:{bootstrap_error}")
    if not ready.is_set():
        return Response(status_code=204)
    return {"ready": True, "model": MODEL}


async def proxy(req: Request, path: str):
    if not ready.is_set():
        raise HTTPException(status_code=503, detail="distilled_internal_vllm_not_ready")
    body = await req.body()
    if path == "/v1/chat/completions":
        try:
            payload = json.loads(body)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="distilled_chat_payload_invalid") from exc
        kwargs = payload.get("chat_template_kwargs")
        if not isinstance(kwargs, dict):
            kwargs = {}
        kwargs["enable_thinking"] = False
        payload["chat_template_kwargs"] = kwargs
        body = json.dumps(payload).encode("utf-8")
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.request(
            req.method,
            f"http://127.0.0.1:{INTERNAL_PORT}{path}",
            content=body,
            headers={"content-type": "application/json"},
        )
    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type=response.headers.get("content-type", "application/json"),
    )


@app.post("/v1/chat/completions")
async def chat(req: Request):
    return await proxy(req, "/v1/chat/completions")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PUBLIC_PORT)
