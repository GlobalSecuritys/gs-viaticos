from typing import Optional

from sqlalchemy.orm import Session

from app.models.log_auditoria import LogAuditoria
from app.models.usuario import Usuario


def registrar_auditoria(
    db: Session,
    actor: Usuario,
    usuario_objetivo: Optional[Usuario],
    accion: str,
    detalle: Optional[str],
    resultado: str,
) -> LogAuditoria:
    """
    Crea y persiste un LogAuditoria. Hace su propio commit: se llama DESPUÉS
    del commit de la acción principal (éxito) o justo antes de relanzar un
    403 (intento fallido) — en ambos casos como una operación de escritura
    independiente y ya cerrada, para no interferir con la transacción de la
    acción que se está auditando.

    usuario_objetivo puede ser None (acciones que no apuntan a un usuario en
    particular); resultado es libre por ahora ('exitoso' / 'fallido') para
    no atarse a un enum todavía.
    """
    log = LogAuditoria(
        actor_id=actor.id,
        actor_nombre=actor.nombre,
        actor_rol=actor.rol,
        usuario_objetivo_id=usuario_objetivo.id if usuario_objetivo else None,
        usuario_objetivo_nombre=usuario_objetivo.nombre if usuario_objetivo else None,
        accion=accion,
        detalle=detalle,
        resultado=resultado,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
