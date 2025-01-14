# Use Python 3.9 as base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY document_requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r document_requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8004

# Start the application
CMD ["uvicorn", "document_service:app", "--host", "0.0.0.0", "--port", "8004"] 