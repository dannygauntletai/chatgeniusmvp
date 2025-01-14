# Use Python 3.11 as base image to match Render's runtime
FROM python:3.11-slim

# Set working directory
WORKDIR /opt/render/project/src

# Create necessary directories
RUN mkdir -p /opt/render/project/src/assistant

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
COPY vector_requirements.txt requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Prisma schema first
COPY prisma ./prisma/

# Generate Prisma client and fetch query engine for the correct platform
RUN cd prisma && \
    prisma generate && \
    prisma py fetch --platform debian-openssl-3.0.x && \
    mv prisma-query-engine-* /opt/render/project/src/assistant/prisma-query-engine-debian-openssl-3.0.x && \
    chmod +x /opt/render/project/src/assistant/prisma-query-engine-debian-openssl-3.0.x

# Set environment variable for Prisma to find the binary
ENV PRISMA_QUERY_ENGINE_BINARY=/opt/render/project/src/assistant/prisma-query-engine-debian-openssl-3.0.x

# Copy remaining application code
COPY . .

# Expose port
EXPOSE 8003

# Start the application
CMD ["uvicorn", "vector_service:app", "--host", "0.0.0.0", "--port", "8003"] 