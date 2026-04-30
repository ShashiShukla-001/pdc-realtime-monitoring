FROM python:3.10

WORKDIR /app

COPY services/consumer/requirements.txt .
RUN pip install -r requirements.txt

COPY services/consumer /app

CMD ["python", "main.py"]