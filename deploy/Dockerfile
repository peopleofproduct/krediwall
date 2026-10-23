# syntax=docker/dockerfile:1
# Krediwall reference gateway image.
#
#   docker build -f deploy/Dockerfile -t krediwall .
#   docker run --rm -p 8080:8080 krediwall
#
# Configuration is entirely environment variables — see
# examples/reference-gateway.mjs for the full list. The image runs as
# non-root, exposes :8080, and HEALTHCHECKs /healthz.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/telemetry-rules/package.json packages/telemetry-rules/package.json
COPY packages/dpi-adapters/package.json packages/dpi-adapters/package.json
COPY packages/enterprise-proxy/package.json packages/enterprise-proxy/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
COPY examples examples
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
# Built workspace node_modules (with @krediwall/* symlinks) + compiled output.
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages packages
COPY --from=build /app/examples examples
RUN chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "examples/reference-gateway.mjs"]
