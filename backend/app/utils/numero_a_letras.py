def numero_a_letras(numero) -> str:
    """Convierte un número a su representación en letras en pesos colombianos."""
    if numero is None:
        return "CERO PESOS"
    try:
        n = int(abs(float(numero)))
    except Exception:
        return "CERO PESOS"

    if n == 0:
        return "CERO PESOS"

    unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"]
    decenas = [
        "", "DIEZ", "VEINTE", "TREINTA", "CUARENTA",
        "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"
    ]
    dieces = [
        "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE",
        "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"
    ]
    centenas = [
        "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS",
        "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"
    ]

    def _seccion(num: int) -> str:
        c = num // 100
        d = (num % 100) // 10
        u = num % 10
        partes = []

        if num == 100:
            return "CIEN"
        if c > 0:
            partes.append(centenas[c])

        if d == 1:
            partes.append(dieces[u])
        elif d == 2:
            if u == 0:
                partes.append("VEINTE")
            else:
                partes.append(f"VEINTI{unidades[u]}")
        elif d > 2:
            if u == 0:
                partes.append(decenas[d])
            else:
                partes.append(f"{decenas[d]} Y {unidades[u]}")
        elif u > 0:
            partes.append(unidades[u])

        return " ".join(p for p in partes if p)

    millones = n // 1_000_000
    miles = (n % 1_000_000) // 1_000
    resto = n % 1_000

    resultado = []
    if millones == 1:
        resultado.append("UN MILLON")
    elif millones > 1:
        resultado.append(f"{_seccion(millones)} MILLONES")

    if miles == 1:
        resultado.append("UN MIL")
    elif miles > 1:
        resultado.append(f"{_seccion(miles)} MIL")

    if resto > 0 or not resultado:
        sec = _seccion(resto)
        if sec:
            resultado.append(sec)

    return (" ".join(resultado) + " PESOS").strip()
