import os
import uvicorn
from app.config import settings

if __name__ == "__main__":
    port = settings.PORT
    print(f"Démarrage du serveur FastAPI Tontine-SaaS sur http://127.0.0.1:{port}")
    print(f"Documentation Swagger interactive : http://127.0.0.1:{port}/docs")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
