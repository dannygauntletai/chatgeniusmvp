from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from prisma import Prisma
import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts.prompt import PromptTemplate
from pinecone import Pinecone, ServerlessSpec
from openai import OpenAI

# Load environment variables
load_dotenv()

# Set environment variables
os.environ["PINECONE_API_KEY"] = os.getenv("PINECONE_API_KEY")
os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")
os.environ["LANGCHAIN_API_KEY"] = os.getenv("LANGCHAIN_API_KEY")
os.environ["LANGCHAIN_TRACING_V2"] = os.getenv("LANGCHAIN_TRACING_V2")
os.environ["LANGCHAIN_PROJECT"] = os.getenv("LANGCHAIN_PROJECT")

# Set Prisma environment variables
os.environ["DATABASE_URL"] = os.getenv("DATABASE_URL")

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Assistant Vector Service")

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Initialize index
index_name = "chatgenius-messages"
try:
    # Check if index exists, if not create it
    if index_name not in pc.list_indexes().names():
        pc.create_index(
            name=index_name,
            dimension=1536,  # text-embedding-3-large dimension
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-west-2"
            )
        )
        print(f"Created new Pinecone index: {index_name}")
    else:
        print(f"Using existing Pinecone index: {index_name}")
except Exception as e:
    print(f"Error initializing Pinecone index: {str(e)}")
    # Continue anyway as the index might already exist

# Initialize embeddings model
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# Initialize chat model
llm = ChatOpenAI(temperature=0.7, model_name="gpt-4")

# Initialize prompt template
CHAT_TEMPLATE = """You are a helpful AI assistant that helps users find relevant information from their chat history.
Please provide a natural and helpful response based on the context provided.

Question: {query}

Context from chat history:
{context}

Please provide a response that:
1. Is relevant to the question
2. Uses information from the context
3. Is natural and conversational
4. Acknowledges if the context doesn't fully answer the question

Response:"""

chat_prompt = PromptTemplate(
    template=CHAT_TEMPLATE,
    input_variables=["query", "context"]
)

# Initialize Prisma client
prisma = Prisma()

client = OpenAI()  # It will automatically use OPENAI_API_KEY from environment

@app.on_event("startup")
async def startup():
    await prisma.connect()

@app.on_event("shutdown")
async def shutdown():
    await prisma.disconnect()

class InitializeResponse(BaseModel):
    total_messages: int
    vectors_created: int
    index_name: str

class Message(BaseModel):
    message_id: str
    channel_name: str
    sender_name: str
    content: str
    created_at: str
    similarity: float

class RetrieveRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=20)
    threshold: float = Field(default=0.7, ge=0, le=1)

class RetrieveResponse(BaseModel):
    query: str
    messages: List[Message]
    ai_response: Optional[str] = None

async def get_all_messages():
    """Retrieve all messages from the database."""
    await prisma.connect()
    try:
        messages = await prisma.message.find_many(
            include={
                'user': True,
                'channel': True,
                'thread': True,
                'replies': {
                    'include': {
                        'user': True
                    }
                },
                'reactions': {
                    'include': {
                        'user': True
                    }
                }
            },
            order_by={
                'createdAt': 'asc'
            }
        )
        return messages
    finally:
        await prisma.disconnect()

@app.post("/initialize", response_model=InitializeResponse)
async def initialize_vector_db():
    """
    Initialize the vector database by:
    1. Creating a new Pinecone index if it doesn't exist
    2. Retrieving all messages from the database
    3. Converting messages to embeddings
    4. Uploading embeddings to Pinecone
    """
    try:
        # Get all messages
        messages = await get_all_messages()
        total_messages = len(messages)
        vectors_created = 0
        batch_size = 100
        
        # Process messages in batches
        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            texts = []
            metadatas = []
            
            for msg in batch:
                # Create a rich context for the message
                thread_context = ""
                if msg.threadId:
                    thread_context = f"\nIn reply to: {msg.thread.content}"
                elif msg.replies:
                    replies_context = "\n".join([f"- {reply.user.username}: {reply.content}" for reply in msg.replies[:3]])
                    thread_context = f"\nThread replies:\n{replies_context}"
                
                reactions_context = ""
                if msg.reactions:
                    reaction_counts = {}
                    for reaction in msg.reactions:
                        reaction_counts[reaction.emoji] = reaction_counts.get(reaction.emoji, 0) + 1
                    reactions_str = " ".join([f"{emoji} ({count})" for emoji, count in reaction_counts.items()])
                    reactions_context = f"\nReactions: {reactions_str}"
                
                context = f"Channel: {msg.channel.name}\nFrom: {msg.user.username}\nMessage: {msg.content}{thread_context}{reactions_context}"
                
                # Prepare metadata
                metadata = {
                    "message_id": str(msg.id),
                    "channel_id": str(msg.channel.id),
                    "channel_name": msg.channel.name,
                    "sender_id": str(msg.user.id),
                    "sender_name": msg.user.username,
                    "content": msg.content,
                    "created_at": str(msg.createdAt),
                    "thread_id": str(msg.threadId) if msg.threadId else None,
                    "has_replies": len(msg.replies) > 0 if msg.replies else False,
                    "reaction_count": len(msg.reactions) if msg.reactions else 0
                }
                
                texts.append(context)
                metadatas.append(metadata)
            
            # Create vector store and add documents
            vector_store = PineconeVectorStore.from_texts(
                texts=texts,
                embedding=embeddings,
                metadatas=metadatas,
                index_name=index_name
            )
            vectors_created += len(texts)
            print(f"Processed batch: {i+1} to {min(i+batch_size, total_messages)} of {total_messages} messages")

        return InitializeResponse(
            total_messages=total_messages,
            vectors_created=vectors_created,
            index_name=index_name
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize vector database: {str(e)}")

@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_similar_messages(request: RetrieveRequest):
    """
    Retrieve messages similar to the query using vector similarity search.
    Then use ChatGPT to generate a response based on the retrieved context.
    
    Parameters:
    - query: The search query
    - top_k: Number of results to return (default: 5)
    - threshold: Minimum similarity score threshold (default: 0.7)
    """
    index_name = "chatgenius-messages"
    
    try:
        # Initialize vector store
        vector_store = PineconeVectorStore(
            embedding=embeddings,
            index_name=index_name
        )
        
        # Get embeddings for the query
        query_embedding = embeddings.embed_query(request.query)
        
        # Get the Pinecone index
        index = pc.Index(index_name)
        
        # Search in both default and documents namespaces
        results = []
        
        # Search in default namespace (chat messages)
        chat_results = index.query(
            vector=query_embedding,
            top_k=request.top_k,
            namespace=""  # default namespace
        )
        results.extend(chat_results.matches)
        
        # Search in documents namespace
        doc_results = index.query(
            vector=query_embedding,
            top_k=request.top_k,
            namespace="documents"
        )
        print("\n=== Document Search Results ===")
        print(f"Found {len(doc_results.matches)} document matches")
        for match in doc_results.matches:
            print(f"\nScore: {match.score}")
            print(f"Metadata: {match.metadata}")
        print("==============================\n")
        results.extend(doc_results.matches)
        
        # Sort all results by score and take top_k
        results.sort(key=lambda x: x.score, reverse=True)
        results = results[:request.top_k]
        
        # Filter results by threshold and prepare messages
        messages = []
        context_text = []
        
        for result in results:
            if result.score < request.threshold:
                continue
                
            # Handle both message and document metadata formats
            metadata = result.metadata
            if "file_name" in metadata:  # Document chunk
                messages.append(Message(
                    message_id=metadata.get("file_id", ""),
                    channel_name="Document",
                    sender_name=metadata.get("file_name", ""),
                    content=match.metadata.get("page_content", ""),
                    created_at=metadata.get("created_at", ""),
                    similarity=result.score
                ))
                context_text.append(f"From document '{metadata.get('file_name')}': {match.metadata.get('page_content', '')}")
            else:  # Chat message
                messages.append(Message(
                    message_id=metadata.get("message_id", ""),
                    channel_name=metadata.get("channel_name", ""),
                    sender_name=metadata.get("sender_name", ""),
                    content=metadata.get("content", ""),
                    created_at=metadata.get("created_at", ""),
                    similarity=result.score
                ))
                context_text.append(metadata.get("content", ""))
        
        # Generate AI response using the context
        prompt_with_context = chat_prompt.invoke({
            "query": request.query,
            "context": "\n\n".join(context_text)
        })
        
        ai_response = llm.invoke(prompt_with_context)
        
        return RetrieveResponse(
            query=request.query,
            messages=messages,
            ai_response=ai_response.content
        )
            
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to retrieve similar messages: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 