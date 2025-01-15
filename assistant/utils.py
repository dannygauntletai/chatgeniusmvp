from prisma import Prisma

_prisma_client = None

def get_prisma():
    global _prisma_client
    if _prisma_client is None:
        _prisma_client = Prisma(auto_register=True)
    return _prisma_client 