FROM golang:1.25-bookworm AS egress-builder
WORKDIR /src
ADD --checksum=sha256:e0a08fe6e91a95c3c323de93f84311fa2366bb687f77e1e32ceb809560086473 https://codeload.github.com/cloudflare/proxy-everything/tar.gz/3cb11951c249ef0b2485fa00a2ab9cad2117f7b4 /src/proxy.tar.gz
# The upstream socket match also diverts ordinary ingress/control connections.
# Only transparent sockets belong to DIVERT; outbound interception stays enabled.
RUN tar -xzf proxy.tar.gz --strip-components=1 \
    && sed -i 's/"-m", "socket", "-j", "DIVERT"/"-m", "socket", "--transparent", "-j", "DIVERT"/g' main.go \
    && CGO_ENABLED=0 go build -ldflags="-s -w -buildid=" -tags=nethttpomithttp2 -trimpath -o /proxy-everything .

FROM cloudflare/proxy-everything:3cb1195@sha256:0ef6716c52430096900b150d84a3302057d6cd2319dae7987128c85d0733e3c8 AS local-egress
COPY --from=egress-builder /proxy-everything /proxy-everything

FROM node:24.14.0-bookworm-slim AS node
FROM docker.io/cloudflare/sandbox:0.13.0-next.751.1
COPY --from=node /usr/local/bin/node /usr/local/bin/finale-node
COPY runner.mjs /opt/finale/runner.mjs
EXPOSE 3000
