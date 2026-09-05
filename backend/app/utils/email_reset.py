"""
email_reset.py — Utilidad para enviar códigos OTP de recuperación de contraseña.

El destino del correo es FIJO (RESET_EMAIL_DESTINO en .env); no importa qué
cuenta solicite el reset, el código siempre llega a la misma casilla.

Si las credenciales SMTP no están configuradas (SMTP_USER o SMTP_PASSWORD
vacías), la función registra el código en los logs del servidor y retorna
True sin enviar correo, lo que facilita el desarrollo local.
"""

import logging
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv
from app.core.config import settings

logger = logging.getLogger(__name__)


def enviar_codigo_reset(cuenta_solicitante: str, codigo: str) -> bool:
    """
    Envía un correo con el código OTP de 6 dígitos al buzón fijo
    definido en RESET_EMAIL_DESTINO.
    """
    # Recargar .env en caliente por si se actualizó sin reiniciar el proceso
    load_dotenv(override=True)

    smtp_host = os.getenv("SMTP_HOST") or getattr(settings, "SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT") or getattr(settings, "SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER") or getattr(settings, "SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD") or getattr(settings, "SMTP_PASSWORD", "")
    destino = os.getenv("RESET_EMAIL_DESTINO") or getattr(settings, "RESET_EMAIL_DESTINO", "tecnicoplantagsb@gsbsecurity.com")

    # ── Si no hay credenciales SMTP configuradas, log y continuar (dev mode) ──
    if not smtp_user or not smtp_password:
        msg = f"[DEV MODE] SMTP no configurado (SMTP_USER/SMTP_PASSWORD vacíos). Código de reset para '{cuenta_solicitante}': {codigo}"
        print(msg)
        logger.warning(msg)
        return True

    print(f"[RESET EMAIL] Iniciando envío de código {codigo} a {destino} (cuenta solicitante: {cuenta_solicitante}) vía {smtp_host}:{smtp_port}...")

    asunto = "GS-Viáticos — Código de recuperación de contraseña"

    html_body = f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Recuperación de contraseña</title>
</head>
<body style="margin:0;padding:0;background:#F0F4FA;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4FA;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#FFFFFF;border-radius:12px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(10,37,64,0.10);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0A2540 0%,#1D63C8 100%);
                       padding:30px 40px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:800;
                         letter-spacing:0.06em;">GLOBAL SECURITY</h1>
              <p style="margin:6px 0 0;color:#93C5FD;font-size:12px;
                        text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">
                Sistema de Viáticos y Gastos Operativos
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:600;">
                Solicitud de recuperación de contraseña
              </p>
              <p style="margin:0 0 24px;font-size:13px;color:#6B7280;line-height:1.6;">
                Se recibió una solicitud para restablecer la contraseña de la cuenta:
                <strong style="color:#1D63C8;">{cuenta_solicitante}</strong>
              </p>

              <!-- Código OTP destacado -->
              <div style="background:#EFF6FF;border:2px solid #BFDBFE;border-radius:10px;
                          padding:24px;text-align:center;margin-bottom:24px;">
                <p style="margin:0 0 8px;font-size:11px;color:#6B7280;text-transform:uppercase;
                           letter-spacing:0.1em;font-weight:700;">Código de verificación</p>
                <p style="margin:0;font-size:42px;font-weight:800;letter-spacing:0.18em;
                           color:#0A2540;font-family:'Courier New',monospace;">{codigo}</p>
                <p style="margin:10px 0 0;font-size:11px;color:#9CA3AF;">
                  Válido por <strong>10 minutos</strong>
                </p>
              </div>

              <p style="margin:0 0 6px;font-size:12px;color:#9CA3AF;line-height:1.6;">
                Ingrese este código en la pantalla de verificación para continuar con el cambio de contraseña.
              </p>
              <p style="margin:0;font-size:12px;color:#EF4444;font-weight:600;">
                Si no reconoce esta solicitud, ignórela — su contraseña no será cambiada.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;
                       padding:16px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9CA3AF;">
                Este mensaje fue generado automáticamente por el sistema GS-Viáticos.
                No responder a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = asunto
        msg["From"] = f"GS-Viáticos <{smtp_user}>"
        msg["To"] = destino

        msg.attach(MIMEText(
            f"Código de recuperación para {cuenta_solicitante}: {codigo}\n"
            f"Válido por 10 minutos.",
            "plain",
            "utf-8"
        ))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        context = ssl.create_default_context()
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, destino, msg.as_string())

        print(f"[RESET EMAIL] ✅ Código {codigo} enviado con éxito a {destino} (solicitante: {cuenta_solicitante})")
        logger.info(
            "Código de reset enviado a %s (solicitante: %s)",
            destino,
            cuenta_solicitante,
        )
        return True

    except Exception as exc:
        print(f"[RESET EMAIL] ❌ Error crítico al enviar correo: {exc}")
        logger.error("Error al enviar correo de reset: %s", exc)
        return False
