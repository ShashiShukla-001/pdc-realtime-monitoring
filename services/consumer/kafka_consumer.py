import json
import time
from kafka import KafkaConsumer
import os

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "pmu-data")


def create_consumer():
    while True:
        try:
            consumer = KafkaConsumer(
                KAFKA_TOPIC,
                bootstrap_servers=KAFKA_BROKER,
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                auto_offset_reset='latest',
                enable_auto_commit=True,
                group_id='pmu-group'
            )
            print("✅ Connected to Kafka Consumer")
            return consumer

        except Exception as e:
            print(f"❌ Kafka not ready, retrying... {e}")
            time.sleep(5)