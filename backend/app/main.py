from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from app.routers.admin import router as admin_router
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
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://gs-viaticos-frontend.onrender.com",
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
app.include_router(admin_router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")
