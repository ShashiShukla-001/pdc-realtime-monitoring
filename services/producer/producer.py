import json
import time
import random
import os
from kafka import KafkaProducer

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "pmu-data")

NUM_DEVICES = 5
SAMPLES_PER_SECOND = 100

# Generate device IDs
DEVICES = [f"PMU-{i}" for i in range(1, NUM_DEVICES + 1)]

def create_producer():
    while True:
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BROKER,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            print("✅ Connected to Kafka")
            return producer
        except Exception as e:
            print(f"❌ Kafka not ready, retrying... {e}")
            time.sleep(5)

def generate_data(device_id):
    return {
        "device_id": device_id,
        "timestamp": int(time.time() * 1000),  # in ms for higher precision
        "frequency": round(random.uniform(49.5, 50.5), 2),

        "voltage_magnitude": round(random.uniform(0.95, 1.05), 3),
        "voltage_angle": round(random.uniform(-5, 5), 2),

        "current": round(random.uniform(5, 20), 2),
    }

def run():
    producer = create_producer()
    interval = 1.0 / SAMPLES_PER_SECOND  # interval between samples

    while True:
        start = time.time()
        # Generate a sample for each device
        for device_id in DEVICES:
            data = generate_data(device_id)
            producer.send(KAFKA_TOPIC, value=data)
            # print(f"📤 Sent: {data}")  # optional, comment out for performance

        # Sleep to maintain rate
        elapsed = time.time() - start
        sleep_time = max(0, interval - elapsed)
        time.sleep(sleep_time)

if __name__ == "__main__":
    run()