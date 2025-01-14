# Use Python 3.11 as base image to match Render's runtime
FROM python:3.11-slim

# Set working directory
WORKDIR /opt/render/project/src

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (required for Prisma)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest

# Install Prisma CLI
RUN npm install -g prisma

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create cache directory
RUN mkdir -p /opt/render/.cache/prisma-python/binaries/5.17.0/393aa359c9ad4a4bb28630fb5613f9c281cde053

# Generate Prisma client and fetch query engine
RUN cd prisma && \
    prisma generate && \
    prisma py fetch --platform debian-openssl-3.0.x && \
    mv prisma-query-engine-* /opt/render/.cache/prisma-python/binaries/5.17.0/393aa359c9ad4a4bb28630fb5613f9c281cde053/prisma-query-engine-debian-openssl-3.0.x && \
    chmod -R 777 /opt/render/.cache/prisma-python

# Expose port
EXPOSE 8002

# Start the application
CMD ["uvicorn", "assistant_service:app", "--host", "0.0.0.0", "--port", "8002"] 