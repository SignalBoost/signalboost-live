// Exact-artifact XSA serving container. This lane deliberately does not use native vLLM:
// XSA changes Qwen3's forward path and must install the same shared runtime used in training.
import { CURRENT_UNIVERSITY_STUDENT_PROFILE } from '../modelCapabilityRegistry.ts'
import type { MassDistilledRuntimeArtifact } from './runpodMassDistilledProvision.ts'
import { exactArtifactContainerImageFromEnv } from './runpodExactArtifactContainerImage.ts'

const IMAGE='vllm/vllm-openai:v0.29.0'
const PORT=8000
const BASE_ID=CURRENT_UNIVERSITY_STUDENT_PROFILE.modelId
const BASE_REV=CURRENT_UNIVERSITY_STUDENT_PROFILE.revision
const clean=(v:unknown,max=2000)=>String(v??'').trim().slice(0,max)

function gatewaySource(){return String.raw`import asyncio, importlib.util, json, os, urllib.request
from pathlib import Path
import torch, uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from huggingface_hub import snapshot_download
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_ID=os.environ["ITMOUNTS_BASE_MODEL_ID"]; BASE_REV=os.environ["ITMOUNTS_BASE_MODEL_REVISION"]
ADAPTER_ID=os.environ["ITMOUNTS_ADAPTER_MODEL_ID"]; ADAPTER_REV=os.environ["ITMOUNTS_ADAPTER_MODEL_REVISION"]
MODEL=os.environ["ITMOUNTS_DISTILLED_MODEL_NAME"]; TOKEN=os.environ["HF_TOKEN"]
RUNTIME_URL=os.environ["ITMOUNTS_XSA_RUNTIME_URL"]; PROFILE=os.environ["ITMOUNTS_XSA_RUNTIME_PROFILE"]
app=FastAPI(); ready=asyncio.Event(); bootstrap_error=None; tokenizer=None; model=None; runtime_receipt=None

class Chat(BaseModel):
    model:str
    messages:list[dict]
    max_tokens:int=128
    temperature:float=0

def load_runtime():
    path=Path("/tmp/itmounts_xsa_runtime.py")
    urllib.request.urlretrieve(RUNTIME_URL,path)
    source=path.read_text("utf-8")
    for marker in ("exclusive_self_attention_projection","install_qwen3_xsa","usesActualValueProjection","gqaAware"):
        if marker not in source: raise RuntimeError("xsa_serving_runtime_contract_invalid")
    spec=importlib.util.spec_from_file_location("itmounts_xsa_runtime",path)
    if spec is None or spec.loader is None: raise RuntimeError("xsa_serving_runtime_import_invalid")
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    if getattr(module,"XSA_RUNTIME_PROFILE",None)!=PROFILE: raise RuntimeError("xsa_serving_runtime_profile_mismatch")
    return module

async def bootstrap():
    global bootstrap_error,tokenizer,model,runtime_receipt
    try:
        base=await asyncio.to_thread(snapshot_download,repo_id=BASE_ID,revision=BASE_REV,token=TOKEN)
        adapter=await asyncio.to_thread(snapshot_download,repo_id=ADAPTER_ID,revision=ADAPTER_REV,token=TOKEN)
        tokenizer=AutoTokenizer.from_pretrained(base,use_fast=True)
        if tokenizer.pad_token is None: tokenizer.pad_token=tokenizer.eos_token
        base_model=AutoModelForCausalLM.from_pretrained(base,torch_dtype=torch.float16,device_map="auto")
        model=PeftModel.from_pretrained(base_model,adapter,is_trainable=False)
        runtime=load_runtime(); runtime_receipt=runtime.install_qwen3_xsa(model)
        if runtime_receipt.get("profile")!=PROFILE or runtime_receipt.get("installedAttentionLayers",0)<=0:
            raise RuntimeError("xsa_serving_runtime_installation_unproven")
        model.eval(); ready.set()
    except Exception as exc:
        bootstrap_error=f"{type(exc).__name__}:{str(exc)[:240]}"

@app.on_event("startup")
async def start(): asyncio.create_task(bootstrap())

@app.get("/ping")
async def ping():
    if bootstrap_error: raise HTTPException(status_code=503,detail=f"xsa_bootstrap_failed:{bootstrap_error}")
    if not ready.is_set(): return {"status":"loading","modelReady":False}
    return {"status":"ready","modelReady":True,"model":MODEL,"attentionArchitecture":"exclusive_self_attention_v1","xsaProfile":PROFILE,"runtimeReceipt":runtime_receipt}

@app.get("/ready")
async def is_ready(): return await ping()

@app.post("/v1/chat/completions")
async def chat(req:Chat):
    if not ready.is_set(): raise HTTPException(status_code=503,detail="xsa_runtime_not_ready")
    if req.model!=MODEL: raise HTTPException(status_code=409,detail="xsa_exact_model_mismatch")
    messages=[{"role":str(m.get("role","user")),"content":str(m.get("content",""))} for m in req.messages]
    rendered=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=False)
    inputs=tokenizer(rendered,return_tensors="pt").to(model.device)
    with torch.inference_mode():
        out=model.generate(**inputs,max_new_tokens=max(1,min(req.max_tokens,1024)),do_sample=False,pad_token_id=tokenizer.pad_token_id,eos_token_id=tokenizer.eos_token_id)
    answer=tokenizer.decode(out[0][inputs["input_ids"].shape[-1]:],skip_special_tokens=True).strip()
    return {"id":"itmounts-xsa","object":"chat.completion","model":MODEL,"choices":[{"index":0,"message":{"role":"assistant","content":answer},"finish_reason":"stop"}],"xsa":{"attentionArchitecture":"exclusive_self_attention_v1","profile":PROFILE}}

if __name__=="__main__": uvicorn.run(app,host="0.0.0.0",port=8000)`}

export function xsaRuntimeInlineContainer(input:MassDistilledRuntimeArtifact,modelName:string){
  if(input.attentionArchitecture!=='exclusive_self_attention_v1'||input.xsaProfile!=='qwen3_xsa_projection_v1') throw new Error('xsa_runtime_artifact_contract_invalid')
  const token=clean(process.env.HF_TOKEN,500); if(token.length<20) throw new Error('HF_TOKEN is not configured')
  const immutableImage=exactArtifactContainerImageFromEnv('xsa')
  const workerUrl=clean(process.env.ITMOUNTS_HF_WORKER_URL,2000)
  const runtimeUrl=immutableImage ? '' : workerUrl.replace(/cos-university-hf-worker\.py$/,'cos-university-xsa-runtime.py')
  if(!immutableImage&&(!workerUrl.startsWith('https://')||!workerUrl.endsWith('/cos-university-hf-worker.py'))) throw new Error('xsa_runtime_source_url_missing')
  const command=immutableImage
    ? 'exec python3 /opt/itmounts/xsa_gateway.py'
    : [
        'set -euo pipefail',
        `export ITMOUNTS_BASE_MODEL_ID='${BASE_ID}'`,`export ITMOUNTS_BASE_MODEL_REVISION='${BASE_REV}'`,
        `export ITMOUNTS_ADAPTER_MODEL_ID='${input.artifactId}'`,`export ITMOUNTS_ADAPTER_MODEL_REVISION='${input.artifactRevision}'`,
        `export ITMOUNTS_DISTILLED_MODEL_NAME='${modelName}'`,`export ITMOUNTS_XSA_RUNTIME_URL='${runtimeUrl}'`,
        "export ITMOUNTS_XSA_RUNTIME_PROFILE='qwen3_xsa_projection_v1'",
        `python3 -c "import base64;open('/tmp/itmounts_xsa_gateway.py','wb').write(base64.b64decode('${Buffer.from(gatewaySource(),'utf8').toString('base64')}'))"`,
        'exec python3 /tmp/itmounts_xsa_gateway.py',
      ].join('; ')
  return Object.freeze({image:immutableImage||IMAGE,args:JSON.stringify({entrypoint:['bash','-lc'],cmd:[command]}),disk:50,ports:[`${PORT}/http`],env:{
    HF_TOKEN:token,HF_HOME:'/models/hf-cache',
    ITMOUNTS_BASE_MODEL_ID:BASE_ID,ITMOUNTS_BASE_MODEL_REVISION:BASE_REV,
    ITMOUNTS_ADAPTER_MODEL_ID:input.artifactId,ITMOUNTS_ADAPTER_MODEL_REVISION:input.artifactRevision,
    ITMOUNTS_DISTILLED_MODEL_NAME:modelName,
    ...(runtimeUrl?{ITMOUNTS_XSA_RUNTIME_URL:runtimeUrl}:{}),
    ITMOUNTS_XSA_RUNTIME_PROFILE:'qwen3_xsa_projection_v1',
    PORT:String(PORT),PORT_HEALTH:String(PORT),HEALTH_CHECK_PATH:'/ping',
  }})
}

export const XSA_SERVING_RUNTIME_IMPLEMENTED=true as const
export const XSA_SERVING_RUNTIME_PROFILE='qwen3_xsa_projection_v1' as const
