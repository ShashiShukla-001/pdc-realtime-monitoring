import json
import logging

from kafka_consumer import create_consumer
from redis_client import get_redis_client
from db import get_db_connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run():
    consumer = create_consumer()
    redis_client = get_redis_client()
    db_conn = get_db_connection()
    cur = db_conn.cursor()

    logger.info("🚀 Consumer started...")

    for message in consumer:
        data = message.value

        try:
            # Save to Redis
            key_latest = f"pmu:{data['device_id']}"
            key_history = f"pmu:{data['device_id']}:history"

            # Latest value (for fast access)
            redis_client.set(key_latest, json.dumps(data))

            # History (for graph)
            redis_client.rpush(key_history, json.dumps(data))

            # Optional: keep only last 500 samples
            redis_client.ltrim(key_history, -500, -1)

            redis_client.sadd("devices", data["device_id"]) #

            # Save to Postgres
            cur.execute("""
                INSERT INTO pmu_data (
                    device_id,
                    timestamp,
                    frequency,
                    voltage_magnitude,
                    voltage_angle,
                    current
                )
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                data["device_id"],
                data["timestamp"],
                data["frequency"],
                data["voltage_magnitude"],
                data["voltage_angle"],
                data["current"]
            ))

            db_conn.commit()

            # logger.info(f"✅ Saved: {data}")

        except Exception as e:
            db_conn.rollback()
            logger.error(f"❌ Error: {e}")


if __name__ == "__main__":
    run()