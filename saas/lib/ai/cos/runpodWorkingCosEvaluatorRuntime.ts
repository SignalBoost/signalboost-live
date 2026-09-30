import type { WorkingCosEvaluatorRuntimeBinding } from './cosWorkingDistillationEvaluatorRuntime.ts'
import { exactArtifactContainerImageFromEnv } from './runpodExactArtifactContainerImage.ts'

const IMAGE='vllm/vllm-openai:v0.29.0'
const PORT=8000
const clean=(v:unknown,n=2000)=>String(v??'').trim().slice(0,n)

function gatewaySource(){return String.raw`import asyncio, contextlib, os
import torch, uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from huggingface_hub import snapshot_download
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_ID=os.environ["ITMOUNTS_BASE_MODEL_ID"];BASE_REV=os.environ["ITMOUNTS_BASE_MODEL_REVISION"]
ADAPTER_ID=os.environ["ITMOUNTS_ADAPTER_MODEL_ID"];ADAPTER_REV=os.environ["ITMOUNTS_ADAPTER_MODEL_REVISION"]
MODEL=os.environ["ITMOUNTS_DISTILLED_MODEL_NAME"];TOKEN=os.environ["HF_TOKEN"]
app=FastAPI();ready=asyncio.Event();bootstrap_error=None;tokenizer=None;model=None;generate_lock=asyncio.Lock()

class Chat(BaseModel):
    model:str
    messages:list[dict]
    max_tokens:int=128
    temperature:float=0

async def bootstrap():
    global bootstrap_error,tokenizer,model
    try:
        base=await asyncio.to_thread(snapshot_download,repo_id=BASE_ID,revision=BASE_REV,token=TOKEN)
        adapter=await asyncio.to_thread(snapshot_download,repo_id=ADAPTER_ID,revision=ADAPTER_REV,token=TOKEN)
        tokenizer=AutoTokenizer.from_pretrained(base,use_fast=True)
        if tokenizer.pad_token is None: tokenizer.pad_token=tokenizer.eos_token
        base_model=AutoModelForCausalLM.from_pretrained(base,torch_dtype=torch.float16,device_map="auto")
        model=PeftModel.from_pretrained(base_model,adapter,is_trainable=False);model.eval();ready.set()
    except Exception as exc: bootstrap_error=f"{type(exc).__name__}:{str(exc)[:240]}"

@app.on_event("startup")
async def start(): asyncio.create_task(bootstrap())

@app.get("/ping")
async def ping():
    if bootstrap_error: raise HTTPException(status_code=503,detail=f"working_cos_bootstrap_failed:{bootstrap_error}")
    if not ready.is_set(): return {"status":"loading","modelReady":False}
    return {"status":"ready","modelReady":True,"model":MODEL,"baseModel":BASE_ID,"baseRevision":BASE_REV,"adapterModel":ADAPTER_ID,"adapterRevision":ADAPTER_REV,"runtimeProfile":"working_cos_independent_evaluator_runtime_v1"}

@app.get("/ready")
async def is_ready(): return await ping()

@app.post("/v1/chat/completions")
async def chat(req:Chat):
    if not ready.is_set(): raise HTTPException(status_code=503,detail="working_cos_runtime_not_ready")
    if req.model not in (MODEL,BASE_ID): raise HTTPException(status_code=409,detail="working_cos_exact_model_mismatch")
    baseline=req.model==BASE_ID
    messages=[{"role":str(m.get("role","user")),"content":str(m.get("content",""))} for m in req.messages]
    rendered=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=False)
    inputs=tokenizer(rendered,return_tensors="pt").to(model.device)
    async with generate_lock:
        with torch.inference_mode(),(model.disable_adapter() if baseline else contextlib.nullcontext()):
            out=model.generate(**inputs,max_new_tokens=max(1,min(req.max_tokens,1024)),do_sample=False,pad_token_id=tokenizer.pad_token_id,eos_token_id=tokenizer.eos_token_id)
    answer=tokenizer.decode(out[0][inputs["input_ids"].shape[-1]:],skip_special_tokens=True).strip()
    return {"id":"itmounts-working-cos-evaluator","object":"chat.completion","model":req.model,"choices":[{"index":0,"message":{"role":"assistant","content":answer},"finish_reason":"stop"}],"exactArtifact":{"baseline":baseline,"baseRevision":BASE_REV,"adapterRevision":ADAPTER_REV}}

if __name__=="__main__": uvicorn.run(app,host="0.0.0.0",port=8000)`}

export function workingCosEvaluatorInlineContainer(binding:WorkingCosEvaluatorRuntimeBinding,modelName:string){
  if(binding.runtimeClass!=='transformers_peft_exact_adapter'||binding.productionTrafficAuthorized!==false||binding.authorityExpanded!==false)throw new Error('working_cos_evaluator_runtime_contract_invalid')
  const token=clean(process.env.HF_TOKEN,500);if(token.length<20)throw new Error('HF_TOKEN is not configured')
  // Reuse the pinned Transformers/PEFT image lane, but not the XSA gateway or 4B mass runtime.
  const immutableImage=exactArtifactContainerImageFromEnv('xsa')
  const command=immutableImage
    ? [
        'set -euo pipefail',
        `python3 -c "import base64;open('/tmp/itmounts_working_cos_gateway.py','wb').write(base64.b64decode('${Buffer.from(gatewaySource(),'utf8').toString('base64')}'))"`,
        'exec python3 /tmp/itmounts_working_cos_gateway.py',
      ].join('; ')
    : [
        'set -euo pipefail',
        `python3 -c "import base64;open('/tmp/itmounts_working_cos_gateway.py','wb').write(base64.b64decode('${Buffer.from(gatewaySource(),'utf8').toString('base64')}'))"`,
        'exec python3 /tmp/itmounts_working_cos_gateway.py',
      ].join('; ')
  return Object.freeze({image:immutableImage||IMAGE,args:JSON.stringify({entrypoint:['bash','-lc'],cmd:[command]}),disk:80,ports:[`${PORT}/http`],env:{
    HF_TOKEN:token,HF_HOME:'/models/hf-cache',
    ITMOUNTS_BASE_MODEL_ID:binding.baseModelId,ITMOUNTS_BASE_MODEL_REVISION:binding.baseModelRevision,
    ITMOUNTS_ADAPTER_MODEL_ID:binding.adapterModelId,ITMOUNTS_ADAPTER_MODEL_REVISION:binding.adapterRevision,
    ITMOUNTS_DISTILLED_MODEL_NAME:modelName,
    PORT:String(PORT),PORT_HEALTH:String(PORT),HEALTH_CHECK_PATH:'/ping',
  }})
}

export const WORKING_COS_EVALUATOR_SERVING_RUNTIME_IMPLEMENTED=true as const
