import requests
import time
import logging
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get service URL from environment or use default
SERVICE_URL = os.getenv("ASSISTANT_SERVICE_URL", "http://localhost:8000")

def check_health():
    """Ping the health endpoint and log the result."""
    try:
        response = requests.get(f"{SERVICE_URL}/health")
        if response.status_code == 200:
            logger.info(f"Health check passed at {datetime.now()}")
            return True
        else:
            logger.error(f"Health check failed with status code {response.status_code}")
            return False
    except Exception as e:
        logger.error(f"Health check failed with error: {str(e)}")
        return False

def wait_for_service(max_retries=10, initial_delay=5):
    """Wait for the service to become available."""
    logger.info("Waiting for service to start...")
    delay = initial_delay
    
    for i in range(max_retries):
        if check_health():
            logger.info("Service is up and running!")
            return True
        if i < max_retries - 1:  # Don't sleep after last attempt
            logger.info(f"Retry {i+1}/{max_retries} in {delay:.1f} seconds...")
            time.sleep(delay)
            delay *= 1.5  # Exponential backoff
    return False

def main():
    """Run health checks every 10 minutes."""
    logger.info(f"Starting health checks for service at {SERVICE_URL}")
    
    # Wait for service to start initially
    if not wait_for_service():
        logger.error("Service failed to start. Exiting.")
        return
    
    # Begin regular health checks
    while True:
        check_health()
        time.sleep(600)  # Sleep for 10 minutes

if __name__ == "__main__":
    logger.info("Starting health check service...")
    main() 