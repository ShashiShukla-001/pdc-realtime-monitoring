import redis, json, time

r = redis.Redis(host="localhost", port=6379, decode_responses=True)

devices = ["PMU-1", "PMU-2", "PMU-3", "PMU-4", "PMU-5"]

while True:
    print("\n--- Latest Samples ---")

    for device in devices:
        key = f"pmu:{device}:history"
        last_sample = r.lindex(key, -1)

        if last_sample:
            data = json.loads(last_sample)
            print(f"{device} → Time: {data['timestamp']} | V: {data['voltage_magnitude']} | F: {data['frequency']} | I: {data['current']}")
        else:
            print(f"{device} → No data")

    time.sleep(1)