import asyncio,json,os
from pathlib import Path
import httpx,uvicorn
from fastapi import FastAPI,HTTPException,Request,Response
from huggingface_hub import snapshot_download
BASE_ID=os.environ["ITMOUNTS_BASE_MODEL_ID"];BASE_REV=os.environ["ITMOUNTS_BASE_MODEL_REVISION"]
ADAPTER_ID=os.environ["ITMOUNTS_ADAPTER_MODEL_ID"];ADAPTER_REV=os.environ["ITMOUNTS_ADAPTER_MODEL_REVISION"]
MODEL=os.environ["ITMOUNTS_DISTILLED_MODEL_NAME"];TOKEN=os.environ["HF_TOKEN"];INTERNAL=8001
app=FastAPI();ready=asyncio.Event();bootstrap_error=None;proc=None
def cached_base():
    org,name=BASE_ID.split("/",1);p=Path("/runpod-volume/huggingface-cache/hub")/f"models--{org}--{name}"/"snapshots"/BASE_REV
    return str(p) if p.is_dir() else None
async def bootstrap():
    global bootstrap_error,proc
    try:
        base=cached_base() or await asyncio.to_thread(snapshot_download,repo_id=BASE_ID,revision=BASE_REV,local_dir="/models/base",token=TOKEN)
        adapter=await asyncio.to_thread(snapshot_download,repo_id=ADAPTER_ID,revision=ADAPTER_REV,local_dir="/models/adapter",token=TOKEN)
        lora=json.dumps({"name":MODEL,"path":adapter,"base_model_name":BASE_ID})
        proc=await asyncio.create_subprocess_exec("vllm","serve",base,"--host","127.0.0.1","--port",str(INTERNAL),"--served-model-name",BASE_ID,"--enable-lora","--max-lora-rank","16","--max-loras","1","--max-cpu-loras","1","--lora-modules",lora,"--gpu-memory-utilization","0.85","--max-model-len","8192","--dtype","auto","--enforce-eager")
        async with httpx.AsyncClient(timeout=2.0) as client:
            for _ in range(300):
                if proc.returncode is not None: raise RuntimeError(f"vllm_exited_{proc.returncode}")
                try:
                    if (await client.get(f"http://127.0.0.1:{INTERNAL}/health")).status_code==200: ready.set();return
                except Exception: pass
                await asyncio.sleep(1)
        raise TimeoutError("vllm_internal_health_timeout")
    except Exception as exc: bootstrap_error=f"{type(exc).__name__}:{str(exc)[:240]}"
@app.on_event("startup")
async def start(): asyncio.create_task(bootstrap())
@app.get("/ping")
async def ping():
    if bootstrap_error: raise HTTPException(status_code=503,detail=f"distilled_bootstrap_failed:{bootstrap_error}")
    if not ready.is_set(): return Response(status_code=204)
    return {"status":"ready","modelReady":True,"model":MODEL,"artifactRevision":ADAPTER_REV}
@app.get("/ready")
async def is_ready(): return await ping()
@app.post("/v1/chat/completions")
async def chat(req:Request):
    if not ready.is_set(): raise HTTPException(status_code=503,detail="distilled_internal_vllm_not_ready")
    body=await req.body()
    try: payload=json.loads(body)
    except Exception: raise HTTPException(status_code=400,detail="distilled_chat_payload_invalid")
    if payload.get("model") not in (BASE_ID,MODEL): raise HTTPException(status_code=409,detail="distilled_exact_model_mismatch")
    kwargs=payload.get("chat_template_kwargs") if isinstance(payload.get("chat_template_kwargs"),dict) else {}
    kwargs["enable_thinking"]=False;payload["chat_template_kwargs"]=kwargs
    async with httpx.AsyncClient(timeout=120.0) as client:
        r=await client.post(f"http://127.0.0.1:{INTERNAL}/v1/chat/completions",content=json.dumps(payload).encode(),headers={"content-type":"application/json"})
    return Response(content=r.content,status_code=r.status_code,media_type=r.headers.get("content-type","application/json"))
if __name__=="__main__": uvicorn.run(app,host="0.0.0.0",port=8000)
