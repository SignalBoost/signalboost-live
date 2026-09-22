FROM vllm/vllm-openai:v0.29.0

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/hf-cache \
    PORT=8000 \
    PORT_HEALTH=8000 \
    HEALTH_CHECK_PATH=/ping

WORKDIR /app

# Fail the image build if the upstream vLLM image ever stops carrying the gateway dependencies.
RUN python3 -c "import fastapi, httpx, uvicorn, huggingface_hub"

COPY app.py /app/app.py

LABEL org.opencontainers.image.source="https://github.com/SignalBoost/signalboost-live"
LABEL org.opencontainers.image.description="iTMounts exact-artifact RunPod load-balancer canary worker"

EXPOSE 8000

ENTRYPOINT ["python3", "/app/app.py"]
