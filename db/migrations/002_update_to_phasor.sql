-- Drop old table
DROP TABLE IF EXISTS pmu_data;

-- Create new phasor-based table
CREATE TABLE pmu_data (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50),
    timestamp BIGINT,
    frequency FLOAT,
    voltage_magnitude FLOAT,
    voltage_angle FLOAT,
    current FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);