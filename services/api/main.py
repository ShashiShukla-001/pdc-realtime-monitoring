from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import time

from redis_client import get_redis

app = FastAPI()

# ✅ Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # Vite dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_client = get_redis()


# -------------------------
# API to get device list
# -------------------------
@app.get("/devices")
def get_devices():

    devices = redis_client.smembers("devices")

    return {
        "devices": [
            {"device_id": d, "device_name": d}
            for d in sorted(devices)
        ]
    }


# -------------------------
# WebSocket for live data
# -------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("🔌 WebSocket connected")

    try:
        while True:
            devices = redis_client.smembers("devices")

            payload = []

            for device in devices:
                device_id = device.decode() if isinstance(device, bytes) else device
                key = f"pmu:{device_id}"

                data = redis_client.get(key)

                if data:
                    data_str = data.decode() if isinstance(data, bytes) else data
                    payload.append(json.loads(data_str))

            # 🔥 send ONE batch instead of many messages
            if payload:
                await websocket.send_text(json.dumps(payload))

            await asyncio.sleep(0.2)

    except Exception as e:
        print("❌ WebSocket crashed:", e)