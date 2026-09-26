FROM vllm/vllm-openai:v0.29.0
WORKDIR /opt/itmounts
RUN python3 -m pip install --no-cache-dir fastapi uvicorn httpx huggingface_hub peft transformers accelerate
COPY mass_gateway.py /opt/itmounts/mass_gateway.py
COPY xsa_gateway.py /opt/itmounts/xsa_gateway.py
ENV PYTHONUNBUFFERED=1 PORT=8000 PORT_HEALTH=8000 HEALTH_CHECK_PATH=/ping
EXPOSE 8000
