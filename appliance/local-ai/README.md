# SignalBoost Local Open-Model Inference

This stack lets a buyer run COS/Supervisor text inference entirely on the appliance without sending prompts to a cloud model provider.

## Runtime architecture

`SignalBoost backend -> 127.0.0.1:8000/v1 -> vLLM or llama.cpp -> local model files`

The inference service binds only to loopback and also lives on an internal Docker network. It is not intentionally exposed to the buyer LAN. Runtime containers set Hugging Face/Transformers offline flags and mount model files read-only.

## Factory workflow

1. Review and accept the selected model license and acceptable-use terms.
2. Pin an immutable Hugging Face revision.
3. Run `factory-provision-model.sh` while the manufacturing environment has controlled internet access.
4. If GGUF is required, use a pinned llama.cpp checkout/build and run `factory-quantize-gguf.sh`.
5. Verify `SHA256SUMS`, then ship the model on the appliance SSD/NVMe.
6. Customer runtime requires no Hugging Face token or internet connection.

Example source models include `meta-llama/Llama-3.3-70B-Instruct` and `deepseek-ai/DeepSeek-R1-Distill-Llama-70B`. Do not assume their licenses are interchangeable: Llama 3.3 uses Meta's Llama 3.3 Community License; DeepSeek's model card also identifies the 70B distill as derived from Llama 3.3. Legal/license acceptance belongs in the factory release process, not in runtime code.

## Engine profiles

### vLLM

Use for high-throughput NVIDIA inference with a model artifact supported by the shipped GPU topology. Configure `LOCAL_AI_MODEL_PATH`, `LOCAL_AI_MODEL_NAME`, and `LOCAL_AI_TENSOR_PARALLEL_SIZE`, then run:

```bash
docker compose --env-file .env -f docker-compose.yml --profile vllm up -d
```

### llama.cpp

Use for GGUF models and hardware where CPU/unified-memory/partial-GPU-offload behavior is desirable. Configure `LOCAL_AI_GGUF_PATH` and run:

```bash
docker compose --env-file .env -f docker-compose.yml --profile llamacpp up -d
```

## Hardware fit

Do not size a 70B model from the nominal `4-bit` number alone. A 70B 4-bit weight set is already roughly 35 GB before quantization metadata, KV cache, runtime workspace, and other allocations. A single 24 GB RTX 4090 therefore is not a full-GPU 70B target. For that class of appliance either use a smaller model, use llama.cpp with deliberate CPU/RAM offload, or ship enough aggregate GPU/unified memory. The release manifest must record the exact model artifact and hardware profile that was validated together.

## Backend configuration

```dotenv
AI_MODEL_PROVIDER=local
LOCAL_AI_BASE_URL=http://127.0.0.1:8000/v1
LOCAL_AI_MODEL=signalboost-local-brain
LOCAL_AI_API_KEY=<random appliance-local secret>
LOCAL_AI_ALLOW_CLOUD_FALLBACK=false
```

`LOCAL_AI_ALLOW_CLOUD_FALLBACK` defaults effectively to false. If local inference fails, prompts do not leave the appliance unless the buyer explicitly opts into cloud fallback.

## Security requirements

- Never bake Hugging Face tokens into the runtime image.
- Generate the local API key per appliance or installation.
- Keep the inference endpoint on loopback/internal networks only.
- Mount model weights read-only in runtime containers.
- Pin model revisions and container images/digests in release manifests.
- Verify factory-generated SHA-256 manifests before shipment and after service/recovery operations.
- Treat model/license changes as controlled release changes.
