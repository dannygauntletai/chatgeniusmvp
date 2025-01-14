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

# Generate Prisma client and fetch query engine
RUN cd prisma && \
    prisma generate && \
    prisma py fetch --platform debian-openssl-3.0.x

# Make the binary executable wherever it was placed
RUN chmod +x prisma-query-engine-*

# Add a startup script to debug and ensure binary exists
RUN echo '#!/bin/bash\necho "Checking for Prisma binary..."\nfind / -name "prisma-query-engine-*" 2>/dev/null\necho "Starting application..."\nexec "$@"' > /start.sh && \
    chmod +x /start.sh

# Expose port
EXPOSE 8002

# Start the application with our debug wrapper
ENTRYPOINT ["/start.sh"]
CMD ["uvicorn", "assistant_service:app", "--host", "0.0.0.0", "--port", "8002"] 