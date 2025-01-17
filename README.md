# ChatGenius v2

# Stack

- Node.js
- React
- Tailwind CSS
- Shadcn UI
- Supabase
- Clerk
- Prisma
- Pinecone (Vector DB)
- OpenAI
- LangChain

# Features implemented:

Core Features:
- Auth, real-time messaging
- Channel/DM organization (ironing out bugs)
- File sharing & file search
- Real-time user presence & status (through emoji selection)
- Nested thread support
- Emoji reactions

Advanced AI Features:
- Semantic search with RAG (Retrieval Augmented Generation)
- Context-aware responses using vector similarity search
- Intelligent message retrieval based on channel type and access
- Document processing and chunking for large file context
- Query analysis for user-specific context and preferences
- Adaptive context management with auto-summarization
- Channel-specific context boundaries (public/private/DM)

Technical Capabilities:
- Vector similarity search with configurable thresholds
- Automatic document chunking and indexing
- Context-aware response generation
- Real-time message vectorization
- Intelligent query analysis
- Channel-specific context filtering
- Document summarization for search

# Demo link

https://chatgenius.fyi

# Quick demo clip

https://imgur.com/a/IcLEKy9

# Things on radar to fix
 - [ ] Channel and message search, only files work atm
 - [ ] Optimize vector search performance
 - [ ] Improve context relevance scoring
 - [ ] Add support for more document types in RAG
 - [ ] Implement better context pruning strategies

Reimplemented the MVP yesterday (1/11)
