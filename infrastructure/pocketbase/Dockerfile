FROM alpine:3.21

ARG TARGETARCH
ARG PB_VERSION

RUN test -n "$PB_VERSION" \
  && apk add --no-cache ca-certificates curl unzip \
  && case "$TARGETARCH" in amd64) PB_ARCH=amd64 ;; arm64) PB_ARCH=arm64 ;; *) echo "Unsupported architecture: $TARGETARCH"; exit 1 ;; esac \
  && curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -o /tmp/pocketbase.zip \
  && unzip /tmp/pocketbase.zip -d /pb \
  && chmod +x /pb/pocketbase \
  && rm -f /tmp/pocketbase.zip

WORKDIR /pb
COPY pb_migrations ./pb_migrations

EXPOSE 8090
VOLUME ["/pb/pb_data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8090/api/health >/dev/null || exit 1

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations"]
