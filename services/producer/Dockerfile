FROM python:3.10

WORKDIR /app

COPY services/producer/requirements.txt .
RUN pip install -r requirements.txt

COPY services/producer /app

CMD ["python", "producer.py"]