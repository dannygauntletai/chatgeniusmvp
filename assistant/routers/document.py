from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Body
from typing import List
import os
from dotenv import load_dotenv
from pinecone import Pinecone
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain_core.documents import Document
from langchain_community.document_loaders.pdf import PyPDFLoader
from langchain_community.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.prompts.prompt import PromptTemplate
import httpx
from datetime import datetime
from models import ProcessDocumentResponse, FileObject
from io import BytesIO
import tempfile
from pydantic import BaseModel

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter(prefix="/document")

# Initialize components
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
llm = ChatOpenAI(model_name="gpt-4-turbo-preview", temperature=0)

# Initialize vector stores for different purposes
chunk_store = PineconeVectorStore(
    index_name="chatgenius-messages",
    embedding=embeddings,
    pinecone_api_key=os.getenv("PINECONE_API_KEY"),
    namespace="documents"
)

summary_store = PineconeVectorStore(
    index_name="chatgenius-messages",
    embedding=embeddings,
    pinecone_api_key=os.getenv("PINECONE_API_KEY"),
    namespace="document_summaries"
)

# Initialize prompt template for summaries
SUMMARY_TEMPLATE = """Provide a comprehensive summary of this document that captures the main topics and key information. 
This summary will be used to help find this document when relevant to user queries.

Document: {document}

Summary:"""

summary_prompt = PromptTemplate(
    template=SUMMARY_TEMPLATE,
    input_variables=["document"]
)

class ProcessDocumentRequest(BaseModel):
    file_url: str
    file_id: str
    file_name: str
    file_type: str

async def process_chunks(raw_documents: List[Document], file_id: str, file_name: str) -> int:
    """Process and store document chunks."""
    try:
        # Split documents into smaller chunks
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=600,  # Reduced chunk size for better processing
            chunk_overlap=100
        )
        chunks = text_splitter.split_documents(raw_documents)
        print(f"Split into {len(chunks)} chunks")

        # Add metadata to chunks
        for i, chunk in enumerate(chunks):
            chunk.metadata.update({
                "file_id": file_id,
                "file_name": file_name,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "source_type": "document",
                "page_number": chunk.metadata.get("page", 1)
            })

        # Store chunks
        chunk_store.add_documents(chunks)
        print(f"Stored {len(chunks)} chunks in vector store")
        return len(chunks)

    except Exception as e:
        print(f"Error processing chunks: {str(e)}")
        raise

async def process_summary(raw_documents: List[Document], file_id: str, file_name: str, total_chunks: int):
    """Generate and store document summary."""
    try:
        # Combine all document content
        all_text = "\n\n".join([doc.page_content for doc in raw_documents])
        
        # Generate summary using prompt template
        prompt_value = summary_prompt.invoke({"document": all_text})
        summary = await llm.ainvoke(prompt_value)
        
        # Create summary document
        summary_doc = Document(
            page_content=summary.content,
            metadata={
                "file_id": file_id,
                "file_name": file_name,
                "source_type": "document_summary",
                "total_pages": len(raw_documents),
                "total_chunks": total_chunks
            }
        )
        
        # Store summary
        summary_store.add_documents([summary_doc])
        print("Stored document summary")

    except Exception as e:
        print(f"Error processing summary: {str(e)}")
        raise

@router.post("/process", response_model=ProcessDocumentResponse)
async def process_document(request: ProcessDocumentRequest):
    """Process a document by splitting into chunks and generating a summary."""
    try:
        print(f"\n=== Processing document: {request.file_name} ===")
        
        # Download file content
        async with httpx.AsyncClient() as client:
            print("Downloading file content...")
            response = await client.get(request.file_url)
            if not response.is_success:
                raise HTTPException(
                    status_code=500, 
                    detail=f"Failed to download file: {response.status_code}"
                )
            content = response.content

        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        try:
            # Load document based on file type
            if request.file_type.endswith('pdf'):
                loader = PyPDFLoader(temp_path)
            else:
                text_content = content.decode('utf-8')
                loader = TextLoader(BytesIO(text_content.encode('utf-8')))
            
            raw_documents = loader.load()
            
            # Process chunks first
            total_chunks = await process_chunks(raw_documents, request.file_id, request.file_name)
            
            # Then process summary
            await process_summary(raw_documents, request.file_id, request.file_name, total_chunks)
            
            return ProcessDocumentResponse(
                message="Document processed successfully",
                file_name=request.file_name,
                chunks_created=total_chunks
            )

        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_path)
            except Exception as cleanup_error:
                print(f"Warning: Failed to clean up temporary file: {str(cleanup_error)}")

    except Exception as e:
        error_msg = f"Error processing document: {str(e)}"
        print(error_msg)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=error_msg)

@router.post("/upload", response_model=FileObject)
async def upload_file(
    file: UploadFile = File(...),
    channelId: str = Form(...),
    userId: str = Form(...)
):
    """Process an uploaded file and store its chunks in the vector store."""
    try:
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name

        try:
            # Load document based on file type
            if file.filename.lower().endswith('.pdf'):
                loader = PyPDFLoader(temp_path)
            else:
                loader = TextLoader(temp_path)
            
            raw_documents = loader.load()
            
            # Process chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=600,
                chunk_overlap=100
            )
            chunks = text_splitter.split_documents(raw_documents)
            
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
            
            # Store chunks
            chunk_store.add_documents(chunks)
            
            return FileObject(
                id=f"doc_{datetime.now().timestamp()}",
                name=file.filename,
                url=f"/api/files/{channelId}/{file.filename}",
                type=file.content_type,
                size=len(content),
                createdAt=datetime.now().isoformat(),
                updatedAt=datetime.now().isoformat(),
                channelId=channelId,
                userId=userId
            )

        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_path)
            except Exception as cleanup_error:
                print(f"Warning: Failed to clean up temporary file: {str(cleanup_error)}")

    except Exception as e:
        print(f"Error processing document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))