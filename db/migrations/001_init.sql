CREATE TABLE IF NOT EXISTS pmu_data (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50),
    timestamp BIGINT,
    voltage FLOAT,
    current FLOAT,
    frequency FLOAT
);