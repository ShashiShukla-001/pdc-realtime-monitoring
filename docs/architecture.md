# System Architecture

## Flow
1. Producer generates PMU data
2. Kafka streams data
3. Consumer processes:
   - Redis → latest data
   - Postgres → historical data
4. API serves:
   - WebSocket → realtime
   - REST → historical
5. Frontend visualizes data