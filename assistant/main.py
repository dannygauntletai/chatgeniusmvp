import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from routers import assistant, vector, document, phone
from utils import get_prisma

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Unified Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://chatgenius.fyi",
        os.getenv("FRONTEND_URL", ""),
        "https://chatgeniusmvp.onrender.com",
        os.getenv("BACKEND_URL", ""),
        "https://chatgeniusmvp-assistant.onrender.com",
        "https://chatgeniusmvp-backend.onrender.com",
        "null"  # Handle requests with no origin
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Initialize Prisma client
prisma = get_prisma()

# Include routers
app.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
app.include_router(vector.router, prefix="/vector", tags=["vector"])
app.include_router(document.router, tags=["document"])
app.include_router(phone.router, prefix="/phone", tags=["phone"])

@app.on_event("startup")
async def startup():
    await prisma.connect()

@app.on_event("shutdown")
async def shutdown():
    await prisma.disconnect()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port) 