from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Body
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Pinecone as LangchainPinecone
from langchain_core.documents import Document
from langchain_community.document_loaders.pdf import PyPDFLoader
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_pinecone import PineconeVectorStore
import httpx
import logging
from datetime import datetime
from models import ProcessDocumentResponse, FileObject
from io import BytesIO
import tempfile
from pydantic import BaseModel
from openai import AsyncOpenAI

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter(prefix="/document")

# Initialize components
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize vector store
vector_store = PineconeVectorStore(
    index_name="chatgenius-messages",
    embedding=embeddings,
    pinecone_api_key=os.getenv("PINECONE_API_KEY"),
    namespace="documents"
)

class ProcessDocumentRequest(BaseModel):
    file_url: str
    file_id: str
    file_name: str
    file_type: str

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
async def process_document(request: ProcessDocumentRequest):
    """Process a document and store it in the vector database with both full content and summary."""
    try:
        print(f"\n=== Processing document: {request.file_name} ===")
        print(f"File URL: {request.file_url}")
        print(f"File Type: {request.file_type}")
        
        # Download file content
        try:
            async with httpx.AsyncClient() as client:
                print("Downloading file content...")
                response = await client.get(request.file_url)
                if not response.is_success:
                    error_msg = f"Failed to download file: {response.status_code} - {response.text}"
                    print(error_msg)
                    raise HTTPException(status_code=500, detail=error_msg)
                content = response.content
                print(f"Downloaded file size: {len(content)} bytes")
        except Exception as download_error:
            error_msg = f"Error downloading file: {str(download_error)}"
            print(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Create temporary file
        try:
            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                print(f"Creating temporary file: {temp_file.name}")
                temp_file.write(content)
                temp_path = temp_file.name
        except Exception as temp_file_error:
            error_msg = f"Error creating temporary file: {str(temp_file_error)}"
            print(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
        
        try:
            # Use appropriate loader based on file type
            print(f"Loading document with type: {request.file_type}")
            if request.file_type.endswith('pdf'):
                try:
                    loader = PyPDFLoader(temp_path)
                    raw_documents = loader.load()
                    print(f"Loaded PDF with {len(raw_documents)} pages")
                except Exception as pdf_error:
                    error_msg = f"Error loading PDF: {str(pdf_error)}"
                    print(error_msg)
                    raise HTTPException(status_code=500, detail=error_msg)
            else:
                try:
                    # For text files, decode the content
                    text_content = content.decode('utf-8')
                    loader = TextLoader(BytesIO(text_content.encode('utf-8')))
                    raw_documents = loader.load()
                    print(f"Loaded text file with {len(raw_documents)} documents")
                except Exception as text_error:
                    error_msg = f"Error loading text file: {str(text_error)}"
                    print(error_msg)
                    raise HTTPException(status_code=500, detail=error_msg)

            # Split documents into smaller chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200
            )
            documents = text_splitter.split_documents(raw_documents)
            print(f"Split into {len(documents)} chunks")

            # Initialize vector stores for different namespaces
            print("Initializing vector stores...")
            doc_vector_store = PineconeVectorStore(
                index_name="chatgenius-messages",
                embedding=embeddings,
                pinecone_api_key=os.getenv("PINECONE_API_KEY"),
                namespace="documents"
            )
            
            summary_vector_store = PineconeVectorStore(
                index_name="chatgenius-messages",
                embedding=embeddings,
                pinecone_api_key=os.getenv("PINECONE_API_KEY"),
                namespace="document_summaries"
            )
            
            # Combine all document content for the summary
            full_content = "\n\n".join([doc.page_content for doc in raw_documents])
            
            try:
                # Generate one summary for the entire document
                summary_prompt = f"""Given this document:

                {full_content[:4000]}  # Taking first 4000 chars to stay within token limits
                
                Provide a comprehensive summary that captures the main topics and key information from the document. This summary will be used to help find this document when relevant to user queries."""
                
                completion = await openai_client.chat.completions.create(
                    model="gpt-4-turbo-preview",
                    messages=[
                        {"role": "system", "content": "You are a document summarizer focused on creating retrievable summaries."},
                        {"role": "user", "content": summary_prompt}
                    ],
                    temperature=0
                )
                
                summary = completion.choices[0].message.content
                
                # Store the summary (only one record)
                summary_doc = Document(
                    page_content=summary,
                    metadata={
                        "file_id": request.file_id,
                        "file_name": request.file_name,
                        "source_type": "document_summary",
                        "total_pages": len(raw_documents),
                        "total_chunks": len(documents)
                    }
                )
                summary_vector_store.add_documents([summary_doc])
                print("Stored document summary")
                
                # Store individual chunks for detailed retrieval
                print(f"Storing {len(documents)} document chunks...")
                for i, doc in enumerate(documents):
                    # Get the original page number from the chunk's metadata
                    original_page = doc.metadata.get("page", 1)
                    
                    full_doc = Document(
                        page_content=doc.page_content,
                        metadata={
                            "file_id": request.file_id,
                            "file_name": request.file_name,
                            "chunk_index": i,
                            "total_chunks": len(documents),
                            "page_number": original_page,
                            "source_type": "document",
                            "summary_id": request.file_id  # Link to the summary
                        }
                    )
                    doc_vector_store.add_documents([full_doc])
                    print(f"Stored chunk {i+1}/{len(documents)}")
                
            except Exception as processing_error:
                error_msg = f"Error processing document content: {str(processing_error)}"
                print(error_msg)
                raise HTTPException(status_code=500, detail=error_msg)
                
            print("Document processing completed successfully")
            return ProcessDocumentResponse(
                message="Document processed successfully",
                file_name=request.file_name,
                chunks_created=len(documents)
            )
            
        finally:
            # Clean up temporary file
            try:
                print(f"Cleaning up temporary file: {temp_path}")
                os.unlink(temp_path)
            except Exception as cleanup_error:
                print(f"Warning: Failed to clean up temporary file: {str(cleanup_error)}")
            
    except Exception as e:
        error_msg = f"Error processing document: {str(e)}"
        print(error_msg)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=error_msg) 