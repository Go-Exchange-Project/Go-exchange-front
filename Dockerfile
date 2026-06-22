# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_WS_URL=ws://localhost:8080/ws
ARG VITE_ENABLE_DEV_TOOLS=true
ARG VITE_DEV_TOOLS_TOKEN=local-dev-token

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_WS_URL=${VITE_WS_URL} \
    VITE_ENABLE_DEV_TOOLS=${VITE_ENABLE_DEV_TOOLS} \
    VITE_DEV_TOOLS_TOKEN=${VITE_DEV_TOOLS_TOKEN}

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
