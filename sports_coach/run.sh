#!/usr/bin/with-contenv bashio

bashio::log.info "Starting Sports Coach..."

# ── Read add-on options ────────────────────────────────────────────────────────
INTERVALS_API_KEY=$(bashio::config 'intervals_api_key')
ATHLETE_ID=$(bashio::config 'athlete_id')
RIDER_MASS=$(bashio::config 'rider_mass_kg')
BIKE_MASS=$(bashio::config 'bike_mass_kg')
SYNC_HOUR=$(bashio::config 'sync_hour')

if [ -z "$INTERVALS_API_KEY" ] || [ -z "$ATHLETE_ID" ]; then
    bashio::log.fatal "intervals_api_key and athlete_id must be set in add-on configuration."
    exit 1
fi

# ── Persistent data directory (survives add-on updates) ───────────────────────
DATA_DIR="/data/sports_coach"
mkdir -p "${DATA_DIR}/streams"

# ── Write .env for pydantic-settings ──────────────────────────────────────────
cat > /app/backend/.env << EOF
INTERVALS_API_KEY=${INTERVALS_API_KEY}
ATHLETE_ID=${ATHLETE_ID}
RIDER_MASS_KG=${RIDER_MASS}
BIKE_MASS_KG=${BIKE_MASS}
DATA_DIR=${DATA_DIR}
SYNC_HOUR=${SYNC_HOUR}
EOF

bashio::log.info "Data directory: ${DATA_DIR}"
bashio::log.info "Daily sync scheduled at ${SYNC_HOUR}:00"

# ── Start FastAPI ──────────────────────────────────────────────────────────────
cd /app/backend
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
