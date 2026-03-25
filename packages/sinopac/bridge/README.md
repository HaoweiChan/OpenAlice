# Sinopac Bridge

Python FastAPI sidecar wrapping [Shioaji](https://sinotrade.github.io/) for OpenAlice.

## Prerequisites

- Python 3.10+
- Sinopac Securities account with API token ([get one here](https://sinotrade.github.io/tutor/prepare/token/))

## Setup

```bash
cd packages/sinopac/bridge
pip install -r requirements.txt
python server.py
```

The bridge starts on port 8890 by default. Override with `SINOPAC_BRIDGE_PORT`.

## Docker

```bash
docker build -t sinopac-bridge .
docker run -p 8890:8890 sinopac-bridge
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/login` | Authenticate with Shioaji |
| GET | `/contracts/{type}/{code}` | Contract lookup |
| GET | `/contracts/search?q=...` | Search contracts |
| POST | `/orders` | Place order |
| PUT | `/orders/{id}` | Modify order |
| DELETE | `/orders/{id}` | Cancel order |
| GET | `/orders` | List orders |
| GET | `/snapshots?codes=...` | Snapshot quotes |
| GET | `/kbars?code=...&start=...&end=...` | Historical OHLCV |
| GET | `/ticks?code=...&date=...` | Historical ticks |
| GET | `/accounts` | List accounts |
| WS | `/stream` | Streaming quotes |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SINOPAC_BRIDGE_PORT` | `8890` | Server port |
