FROM vllm/vllm-openai:v0.29.0

COPY start.sh /opt/itmounts/start.sh
RUN chmod 0755 /opt/itmounts/start.sh

ENV HF_HOME=/models/hf-cache \
    PORT=8000

EXPOSE 8000
ENTRYPOINT ["/opt/itmounts/start.sh"]
