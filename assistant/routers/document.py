from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Body
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Pinecone as LangchainPinecone
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_pinecone import PineconeVectorStore
import tempfile
import httpx
import logging
from datetime import datetime
from models import ProcessDocumentResponse, FileObject

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter(prefix="/document")

# Initialize components
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings(model="text-embedding-3-large")

# Initialize vector store
vector_store = PineconeVectorStore(
    index_name="chatgenius-messages",
    embedding=embeddings,
    pinecone_api_key=os.getenv("PINECONE_API_KEY"),
    namespace="documents"
)

@router.post("/upload", response_model=FileObject)
async def upload_file(
    file: UploadFile = File(...),
    channelId: str = Form(...),
    userId: str = Form(...)
):
    """Process an uploaded file and store its chunks in the vector store."""
    try:
        print(f"\n=== DOCUMENT SERVICE UPLOAD ENDPOINT CALLED ===")
        print(f"File: {file.filename}")
        print(f"Channel: {channelId}")
        print(f"User: {userId}")
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        # Load document based on file type
        if file.filename.lower().endswith('.pdf'):
            loader = PyPDFLoader(temp_path)
            pages = loader.load()
        else:
            loader = TextLoader(temp_path)
            pages = loader.load()
        
        # Split text into chunks
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        chunks = text_splitter.split_documents(pages)
        
        # Add metadata to chunks
        for i, chunk in enumerate(chunks):
            chunk.metadata.update({
                "file_name": file.filename,
                "channel_id": channelId,
                "user_id": userId,
                "source_type": "document",
                "chunk_index": i,
                "total_chunks": len(chunks),
                "page_number": chunk.metadata.get("page", 1)
            })
        
        # Store chunks in vector store
        vector_store.add_documents(chunks)
        
        # Clean up temporary file
        os.unlink(temp_path)
        
        # Return file object in the format expected by frontend
        return FileObject(
            id=f"doc_{datetime.now().timestamp()}",
            name=file.filename,
            url=f"/api/files/{channelId}/{file.filename}",  # Frontend will use this for display
            type=file.content_type,
            size=len(content),
            createdAt=datetime.now().isoformat(),
            updatedAt=datetime.now().isoformat(),
            channelId=channelId,
            userId=userId
        )
        
    except Exception as e:
        print(f"Error processing document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{channel_id}/{file_name}")
async def delete_document(channel_id: str, file_name: str):
    """Delete a document and its chunks from the vector store."""
    try:
        # Delete chunks by metadata filter
        vector_store.delete({
            "channel_id": channel_id,
            "file_name": file_name
        })
        
        return {"message": f"Document {file_name} deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process", response_model=ProcessDocumentResponse)
async def process_document(
    file_id: str = Body(...),
    file_url: str = Body(...),
    channel_id: str = Body(...),
    uploader_id: str = Body(...),
    file_name: str = Body(...),
    file_type: str = Body(...)
):
    """Process a document from a URL and store its chunks in the vector store."""
    try:
        print(f"\n=== DOCUMENT SERVICE PROCESS ENDPOINT CALLED ===")
        print(f"File: {file_name}")
        print(f"URL: {file_url}")
        print(f"Channel: {channel_id}")
        print(f"User: {uploader_id}")
        
        # Download file from URL
        async with httpx.AsyncClient() as client:
            response = await client.get(file_url)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to download file")
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                temp_file.write(response.content)
                temp_path = temp_file.name
            
            # Load document based on file type
            if file_name.lower().endswith('.pdf'):
                loader = PyPDFLoader(temp_path)
                pages = loader.load()
            else:
                loader = TextLoader(temp_path)
                pages = loader.load()
            
            # Split text into chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200
            )
            chunks = text_splitter.split_documents(pages)
            
            # Add metadata to chunks
            for i, chunk in enumerate(chunks):
                chunk.metadata.update({
                    "file_name": file_name,
                    "channel_id": channel_id,
                    "user_id": uploader_id,
                    "source_type": "document",
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "page_number": chunk.metadata.get("page", 1)
                })
            
            # Store chunks in vector store
            vector_store.add_documents(chunks)
            
            # Clean up temporary file
            os.unlink(temp_path)
            
            return ProcessDocumentResponse(
                message="Document processed successfully",
                file_name=file_name,
                chunks_created=len(chunks)
            )
            
    except Exception as e:
        print(f"Error processing document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 