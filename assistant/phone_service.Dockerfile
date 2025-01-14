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

# Copy application code
COPY . .

# Set up Prisma
RUN prisma generate && \
    prisma py fetch

# Expose port
EXPOSE 8001

# Start the application
CMD ["uvicorn", "phone_service:app", "--host", "0.0.0.0", "--port", "8001"] 