# Use Python 3.9 as base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

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

# Copy Prisma schema first
COPY prisma ./prisma/

# Generate Prisma client and fetch query engine
WORKDIR /app/prisma
RUN prisma generate && \
    prisma py fetch && \
    chmod +x prisma-query-engine-* && \
    mv prisma-query-engine-* ../prisma-query-engine-debian-openssl-3.0.x && \
    cd .. && \
    chmod -R 777 .

# Reset working directory and copy remaining code
WORKDIR /app
COPY . .

# Ensure the query engine is executable
RUN chmod +x prisma-query-engine-*

# Expose port
EXPOSE 8002

# Start the application
CMD ["uvicorn", "assistant_service:app", "--host", "0.0.0.0", "--port", "8002"] 