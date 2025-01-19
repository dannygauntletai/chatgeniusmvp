# Vector Store Constants
CHAT_INDEX_NAME = "chatgenius-messages"
SUMMARY_NAMESPACE = "document_summaries"
DOCUMENT_NAMESPACE = "documents"
SUMMARY_THRESHOLD = 0.2
DEFAULT_TOP_K = 5

# Assistant Constants
MODEL_NAME = "gpt-4-turbo-preview"
MAX_TOKENS = 1024  # Response token limit
MAX_CONTEXT_TOKENS = 8192  # For detailed document analysis
MAX_CHUNK_TOKENS = 512  # For document chunks
TEMPERATURE = 0.7
SIMILARITY_THRESHOLD = 0.2  # Threshold for vector similarity
TOP_K = 20  # Number of similar messages to retrieve

# Service URLs
ASSISTANT_SERVICE_URL = "http://localhost:8000"  # Default service URL

# Special User IDs
ASSISTANT_BOT_USER_ID = "assistant-bot"

# Channel Types
CHANNEL_TYPES = {
    'DM': 'dm',
    'PUBLIC': 'public',
    'PRIVATE': 'private',
    'ASSISTANT': 'assistant'
} 