#!/bin/bash

kafka-topics --create \
  --if-not-exists \
  --topic pmu-data \
  --bootstrap-server kafka:9092 \
  --partitions 3 \
  --replication-factor 1