"""
Script para crear o actualizar la cuenta del Evaluador Externo de Pilar.
Asigna rol='evaluador_externo', activo=True, y restringe el acceso a módulos operativos.

Uso:
    python scripts/crear_evaluador_externo.py --nombre "Nombre Evaluador" --correo "correo@ejemplo.com" --password "clave123"

O de forma interactiva ejecutando:
    python scripts/crear_evaluador_externo.py
"""

import argparse
import os
import sys

# Agregar el directorio raíz del backend al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import SessionLocal
from app.models.usuario import Usuario
from app.core.security import hash_password


def crear_o_actualizar_evaluador(nombre: str, correo: str, password: str) -> None:
    correo_clean = correo.strip().lower()
    nombre_clean = nombre.strip()

    if not correo_clean or not nombre_clean or not password:
        print("[ERROR] Todos los campos (nombre, correo y contraseña) son obligatorios.")
        sys.exit(1)

    db = SessionLocal()
    try:
        stmt = select(Usuario).where(Usuario.correo.ilike(correo_clean))
        usuario = db.scalar(stmt)

        pwd_hash = hash_password(password)

        if usuario:
            print(f"[*] El usuario con correo '{correo_clean}' ya existe (ID: {usuario.id}). Actualizando a evaluador_externo...")
            usuario.nombre = nombre_clean
            usuario.password_hash = pwd_hash
            usuario.rol = "evaluador_externo"
            usuario.activo = True
            usuario.acceso_viaticos = False
            usuario.es_admin_calidad = False
            usuario.acceso_mapa = False
            usuario.solo_inventario = False
        else:
            print(f"[*] Creando nuevo usuario con rol 'evaluador_externo' para '{correo_clean}'...")
            usuario = Usuario(
                nombre=nombre_clean,
                correo=correo_clean,
                password_hash=pwd_hash,
                rol="evaluador_externo",
                activo=True,
                acceso_viaticos=False,
                es_admin_calidad=False,
                acceso_mapa=False,
                solo_inventario=False,
            )
            db.add(usuario)

        db.commit()
        db.refresh(usuario)
        print(f"[OK] Usuario evaluador externo configurado exitosamente:")
        print(f"     ID: {usuario.id}")
        print(f"     Nombre: {usuario.nombre}")
        print(f"     Correo: {usuario.correo}")
        print(f"     Rol: {usuario.rol}")
        print(f"     Activo: {usuario.activo}")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error al guardar en base de datos: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crear cuenta para evaluador externo de Pilar")
    parser.add_argument("--nombre", type=str, help="Nombre completo del evaluador externo")
    parser.add_argument("--correo", type=str, help="Correo electrónico del evaluador externo")
    parser.add_argument("--password", type=str, help="Contraseña de acceso")

    args = parser.parse_args()

    nombre = args.nombre
    correo = args.correo
    password = args.password

    if not nombre:
        nombre = input("Ingrese el Nombre del Evaluador Externo: ").strip()
    if not correo:
        correo = input("Ingrese el Correo del Evaluador Externo: ").strip()
    if not password:
        password = input("Ingrese la Contraseña para el Evaluador: ").strip()

    crear_o_actualizar_evaluador(nombre, correo, password)
