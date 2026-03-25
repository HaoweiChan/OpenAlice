FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV SINOPAC_BRIDGE_PORT=8890
EXPOSE 8890

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8890"]
