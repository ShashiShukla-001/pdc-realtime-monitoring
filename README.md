# PDC — Real-Time Phasor Data Concentrator

A real-time monitoring platform that ingests high-frequency PMU (Phasor Measurement Unit) data via **Kafka**, processes it through **Redis** for live delivery and **PostgreSQL** for historical storage, and streams it to a **React** frontend via **WebSocket** for live graph visualization.

---

## Architecture

```
PMU Devices / Simulator
        │
        ▼
   [Kafka Producer]
        │
        ▼
     Kafka Broker
        │
        ▼
   [Kafka Consumer]
      │        │
      ▼        ▼
   Redis    PostgreSQL
(latest)  (historical)
      │        │
      └───┬────┘
          ▼
     FastAPI Server
      │        │
      ▼        ▼
 WebSocket    REST API
      │        │
      └───┬────┘
          ▼
    React Frontend
   (Live Graphs / Charts)
```

### How It Works

1. **Producer** — Simulates PMU devices, emitting readings (voltage, frequency, current, phase angle) every second to a Kafka topic.
2. **Kafka** — Acts as a durable, high-throughput message broker between the producer and consumer.
3. **Consumer** — Reads from Kafka and writes:
   - Latest reading → **Redis** (low-latency cache for real-time delivery)
   - All readings → **PostgreSQL** (for historical queries and trend analysis)
4. **FastAPI** — Serves two interfaces:
   - **WebSocket** — pushes live data from Redis to connected clients
   - **REST API** — serves historical data from PostgreSQL
5. **React Frontend** — Connects via WebSocket and renders live updating graphs for each PMU metric.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Message Broker | Apache Kafka + Zookeeper |
| Stream Cache | Redis |
| Database | PostgreSQL 15 |
| Backend / API | FastAPI |
| Real-time Transport | WebSocket |
| Frontend | React + Vite |
| Containerization | Docker + Docker Compose |

---

## Live Data Fields

Each PMU device emits the following measurements:

| Field | Description | Example Range |
|---|---|---|
| `device_id` | PMU device identifier | `PMU-001` |
| `timestamp` | Unix timestamp in ms | — |
| `frequency` | Grid frequency (Hz) | 49.5 – 50.5 |
| `voltage_magnitude` | Per-unit voltage | 0.95 – 1.05 |
| `voltage_angle` | Phase angle (degrees) | -5° – +5° |
| `current` | Current magnitude (A) | 5 – 20 |

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose installed

### Run the backend (Kafka, Redis, PostgreSQL, Producer, Consumer, API)

```bash
# Clone the repo
git clone https://github.com/ShashiShukla-001/pdc-monitoring.git
cd pdc-monitoring

# Copy env file and configure
cp .env.example .env

# Start all backend services
docker compose up --build
```

Services started:
- Zookeeper on `localhost:2181`
- Kafka broker on `localhost:9092`
- Redis on `localhost:6379`
- PostgreSQL on `localhost:5430`
- FastAPI on `localhost:8000`

### Run the React frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` to view live PMU graphs.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `WS` | `/ws/live` | WebSocket — streams real-time PMU data |
| `GET` | `/api/history/{device_id}` | Historical readings for a device |
| `GET` | `/api/devices` | List of active PMU devices |

---

## Screenshots / Demo

> *Add screenshots or a GIF of the live graphs here*

---

## Project Structure

```
pdc-monitoring/
├── services/
│   ├── producer/       # Kafka producer — simulates PMU data
│   ├── consumer/       # Kafka consumer — writes to Redis + Postgres
│   └── api/            # FastAPI — WebSocket + REST endpoints
├── frontend/           # React + Vite — live graph dashboard
├── db/
│   └── migrations/     # PostgreSQL schema
├── docker-compose.yml
└── .env.example
```

---

## Roadmap

- [ ] Multi-device selector on the frontend
- [ ] Alert thresholds for out-of-range frequency/voltage
- [ ] Historical trend view with date range picker
- [ ] Authentication for API endpoints
- [ ] Replace dummy producer with real PMU IEEE C37.118 parser
