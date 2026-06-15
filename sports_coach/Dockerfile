ARG BUILD_FROM
# ── Stage 1: build React frontend ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ .
# Relative base path required for HA ingress proxy
RUN npm run build

# ── Stage 2: Python runtime ────────────────────────────────────────────────────
FROM ${BUILD_FROM}

# System deps (pandas needs gcc + musl headers)
RUN apk add --no-cache gcc musl-dev python3-dev libffi-dev

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend — FastAPI will serve this as static files
COPY --from=frontend-build /build/dist ./frontend_dist/

COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
