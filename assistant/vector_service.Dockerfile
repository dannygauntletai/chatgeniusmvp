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

# Copy requirements file
COPY vector_requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r vector_requirements.txt

# Copy application code
COPY . .

# Generate Prisma client
RUN prisma generate

# Expose port
EXPOSE 8001

# Start the application
CMD ["uvicorn", "vector_service:app", "--host", "0.0.0.0", "--port", "8001"] 