# Troubleshooting Guide

## Initial Virtual Environment Setup
1. Create virtual environment in project root:
   ```bash
   python -m venv .venv
   ```
2. Activate virtual environment:
   - macOS/Linux: `source .venv/bin/activate`
   - Windows: `.venv\Scripts\activate`
3. Verify correct Python version:
   ```bash
   python --version  # Should show Python 3.10.x
   which python     # Should point to .venv/bin/python
   ```
4. Upgrade pip:
   ```bash
   pip install --upgrade pip
   ```

## Dependency Issues

### Initial Setup Issues
- Python version: Using Python 3.10.13 in virtual environment
- Initial error: ModuleNotFoundError for fastapi
- Prisma client generation failing with ImportError for model_parse

### Clean Installation Steps
1. Remove Python cache and existing installations:
   ```bash
   find . -type d -name "__pycache__" -exec rm -r {} +
   find . -type d -name "*.egg-info" -exec rm -r {} +
   find . -type f -name "*.pyc" -delete
   pip uninstall -y -r requirements.txt
   ```
2. Ensure virtual environment is clean:
   - Deactivate and remove existing venv
   - Create new virtual environment
   - Activate new environment
3. Install dependencies in order (see Environment Setup)

### Dependency Conflicts Found
1. LangChain conflicts:
   - langchain 0.2.17 requires langchain-core>=0.2.43
   - langchain-text-splitters 0.2.4 requires langchain-core>=0.2.38
   - Initial langchain-core 0.1.53 was incompatible
   - langchain-openai 0.0.7 requires langchain-core<0.2.0,>=0.1.26

2. Pinecone conflicts:
   - langchain-pinecone requires pinecone-client<4,>=3
   - Initially had pinecone-client 5.0.1 which was too new

3. Prisma version issues:
   - prisma@5.17.0 and @prisma/client@5.22.0 version mismatch
   - Initial prisma 0.15.0 had compatibility issues

### Working Configuration
```
fastapi==0.109.0
uvicorn==0.27.0
pinecone-client==3.2.2
prisma==0.11.0
python-dotenv==1.0.0
openai==1.14.0
httpx==0.27.2
langchain-openai==0.0.7
langchain-pinecone==0.0.3
langchain-core==0.1.26
langchain-community==0.0.20
langchain==0.2.17
langsmith==0.1.17
aiohttp==3.9.0
python-multipart==0.0.6
twilio==8.10.0
```

## Environment Setup
1. Use Python 3.10.x
2. Create and activate virtual environment
3. Clear Python cache and existing installations (see Clean Installation Steps)
4. Install dependencies in order:
   - Core packages first (fastapi, uvicorn, prisma)
   - Then LangChain ecosystem
   - Finally remaining packages

## Known Issues
1. Prisma client generation may fail if:
   - Wrong Python version is active
   - Prisma versions mismatch
   - Incompatible pydantic version
2. LangChain ecosystem has strict version dependencies:
   - langchain-openai caps langchain-core at <0.2.0
   - Need to balance between different package requirements

## Next Steps
1. Document successful version combinations
2. Test with different Python versions
3. Consider pinning all sub-dependencies 

## Prisma Client Issues
1. Multiple Prisma client initialization:
   - Use singleton pattern through utils.py
   - Import `get_prisma()` from utils instead of creating new clients
   - Only initialize Prisma client once in main.py

## Port Configuration
1. Default port (8000) may be in use:
   - Set PORT environment variable to use different port
   - Example: `PORT=8002 python main.py`
   - Check if any other services are running on the same port

## FastAPI Deprecation Warnings
1. `on_event` is deprecated:
   - Current warnings don't affect functionality
   - Future update: Replace with lifespan event handlers
   - See FastAPI docs: https://fastapi.tiangolo.com/advanced/events/ 