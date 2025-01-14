from langchain_community.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Pinecone
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_community.embeddings import OpenAIEmbeddings
import tempfile
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiohttp
from pinecone import Pinecone, ServerlessSpec
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled
from prisma import Prisma

# Load environment variables
load_dotenv()

# Initialize LangSmith
langsmith_client = Client()

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Document Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://chatgenius.fyi",
        os.getenv("FRONTEND_URL", ""),
        "https://chatgeniusmvp.onrender.com",
        "https://chatgeniusmvp-vector.onrender.com",
        "https://chatgeniusmvp-document.onrender.com",
        "https://chatgeniusmvp-phone.onrender.com",
        "https://chatgeniusmvp-backend.onrender.com",
        os.getenv("VECTOR_SERVICE_URL", ""),
        os.getenv("ASSISTANT_SERVICE_URL", ""),
        os.getenv("PHONE_SERVICE_URL", "")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Initialize Pinecone
pc = Pinecone(
    api_key=os.getenv("PINECONE_API_KEY"),
    environment=os.getenv("PINECONE_ENVIRONMENT")
)

# Initialize LangChain components
embeddings = OpenAIEmbeddings(
    model="text-embedding-3-large",
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# Initialize text splitter
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,  # Smaller chunks for more precise retrieval
    chunk_overlap=100,  # 20% overlap for better context preservation
    length_function=len,
    separators=["\n\n", "\n", " ", ""]  # Try to split on paragraph breaks first
)

# Initialize Prisma client with connection handling
prisma = Prisma(auto_register=True)

async def download_file(url: str, file_type: str) -> str:
    """Download a file from a URL and save it temporarily."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise HTTPException(status_code=400, detail="Failed to download file")
                
                # Create a temporary file with the correct extension
                suffix = ".pdf" if file_type == "application/pdf" else ".txt"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                    tmp_file.write(await response.read())
                    return tmp_file.name
    except Exception as e:
        print(f"Error downloading file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")

async def process_document(file_path: str, file_type: str, metadata: dict) -> list:
    """Load and process a document based on its type."""
    try:
        # Load document based on type
        if file_type == "application/pdf":
            loader = PyPDFLoader(file_path)
        else:  # Assume text file
            loader = TextLoader(file_path)
            
        # Load and split the document with improved chunking
        raw_docs = loader.load()
        print(f"Loaded document: {metadata.get('file_name')}")
        
        chunks = text_splitter.split_documents(raw_docs)
        print(f"Going to add {len(chunks)} chunks to Pinecone")
        
        # Add metadata to each chunk
        for chunk in chunks:
            chunk.metadata.update(metadata)
            
        return chunks
        
    except Exception as e:
        print(f"Error processing document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

async def update_file_status(file_id: str, status: str):
    backend_url = os.getenv("BACKEND_URL", "http://localhost:5000")
    async with aiohttp.ClientSession() as session:
        async with session.put(
            f"{backend_url}/api/files/{file_id}/status",
            json={"status": status}
        ) as response:
            if response.status != 200:
                print(f"Failed to update file status: {await response.text()}")
            return response.status == 200

class ProcessDocumentRequest(BaseModel):
    file_id: str
    file_name: str
    file_url: str
    file_type: str
    channel_id: str
    uploader_id: str

class ProcessDocumentResponse(BaseModel):
    message: str
    chunks_created: int

@app.post("/process", response_model=ProcessDocumentResponse)
async def process_document_endpoint(request: ProcessDocumentRequest):
    """Process a document and store its chunks in the vector store."""
    with tracing_v2_enabled() as tracer:
        try:
            print(f"Processing document: {request.file_name}")
            
            # Download the file
            file_path = await download_file(request.file_url, request.file_type)
            
            # Process the document
            chunks = await process_document(
                file_path,
                request.file_type,
                {
                    "file_id": request.file_id,
                    "file_name": request.file_name,
                    "channel_id": request.channel_id,
                    "uploader_id": request.uploader_id,
                    "channel_name": f"Document: {request.file_name}"  # Add this for better context
                }
            )
            
            # Initialize vector store
            index = pc.Index("chatgenius-messages")
            print("Connected to Pinecone index")
            
            # Prepare documents for indexing with enhanced metadata
            texts = [chunk.page_content for chunk in chunks]
            metadatas = [{
                **chunk.metadata,
                "text": chunk.page_content,
                "content": chunk.page_content,
                "source_type": "document",
                "document_type": request.file_type,
                "page_number": chunk.metadata.get("page", "unknown"),
                "chunk_index": i,
                "total_chunks": len(chunks),
                "sender_name": "Document",  # Add this for consistency with message format
                "message_id": f"{request.file_id}_{i}",  # Add unique ID for each chunk
                "channel_name": f"Document: {request.file_name}"  # Add for better context
            } for i, chunk in enumerate(chunks)]
            
            print(f"Preparing to embed {len(texts)} chunks")
            embeddings_list = embeddings.embed_documents(texts)
            print("Embeddings generated successfully")
            
            # Add vectors to Pinecone
            index.upsert(
                vectors=zip(
                    [f"{request.file_id}_{i}" for i in range(len(texts))],  # More meaningful IDs
                    embeddings_list,
                    metadatas
                ),
                namespace="documents"
            )
            print(f"Successfully added {len(chunks)} vectors to Pinecone")
            
            # Clean up temporary file
            os.unlink(file_path)
            
            # Update file status to PROCESSED
            await update_file_status(request.file_id, "PROCESSED")
            
            print(f"Successfully processed document with {len(chunks)} chunks")
            return ProcessDocumentResponse(
                message="Document processed successfully",
                chunks_created=len(chunks)
            )
            
        except Exception as e:
            print(f"Error in process_document_endpoint: {str(e)}")
            await update_file_status(request.file_id, "FAILED")
            raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@app.get("/stats")
async def get_index_stats():
    """Get statistics about the vector index."""
    try:
        # Get the index
        index = pc.Index("chatgenius-messages")
        print("Connected to Pinecone index")
        
        # Get index stats
        stats = index.describe_index_stats()
        print(f"Index stats: {stats}")
        
        return {
            "status": "ok",
            "index_name": "chatgenius-messages",
            "total_vectors": stats.get("total_vector_count", 0),
            "dimension": stats.get("dimension", 1536)
        }
            
    except Exception as e:
        print(f"Error getting index stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8004"))
    uvicorn.run(app, host="0.0.0.0", port=port) 