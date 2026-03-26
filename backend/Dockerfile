FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Cache-bust: change this value to force rebuild
ARG CACHEBUST=5
# Copy all app code (including entrypoint.sh)
COPY . .

RUN mkdir -p /data/uploads && chmod +x entrypoint.sh

CMD ["./entrypoint.sh"]
