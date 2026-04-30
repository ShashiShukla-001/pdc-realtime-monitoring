FROM python:3.10

WORKDIR /app

COPY services/api/requirements.txt .
RUN pip install -r requirements.txt

COPY services/api /app

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]