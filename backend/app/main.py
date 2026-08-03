from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.auth import router as auth_router
from app.routers.viaticos import router as viaticos_router

app = FastAPI(
    title="GS Viáticos API",
    description="Sistema de gestión de viáticos y gastos operativos para Global Security",
    version="1.0.0",
)

# Configuración de CORS para el frontend (React + Vite)
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(viaticos_router)


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "message": "API de GS Viáticos operando correctamente"}
