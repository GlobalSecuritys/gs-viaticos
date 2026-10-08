"""Verifica el endpoint de lectura inteligente via HTTP simple."""
import urllib.request
import json

url = "http://localhost:8000/api/inventario/planillas/1/lectura-inteligente"
try:
    req = urllib.request.urlopen(url, timeout=8)
    data = json.loads(req.read())
    stock = data.get("stock_por_producto", {})
    prods_con = stock.get("productos", [])
    prods_sin = stock.get("productos_sin_stock", [])

    print("=== ENDPOINT OK ===")
    print(f"total_unidades            : {stock.get('total_unidades')}")
    print(f"total_productos_con_stock : {stock.get('total_productos_con_stock')}")
    print(f"total_productos_sin_stock : {stock.get('total_productos_sin_stock')}")
    print(f"total_referencias         : {stock.get('total_referencias')}")
    print()

    print("Top 5 productos con stock (clave esperada: nombre):")
    for p in prods_con[:5]:
        nombre = p.get("nombre", "⚠ SIN CLAVE nombre")
        cant   = p.get("cantidad", "?")
        fuente = p.get("fuente", "?")
        regs   = p.get("total_registros", "?")
        print(f"  [{fuente}] {nombre!r:60s} -> {cant} u. / {regs} regs")

    # Verificar suma
    suma_con = sum(p.get("cantidad", 0) for p in prods_con)
    suma_sin = sum(p.get("cantidad", 0) for p in prods_sin)
    print()
    print(f"Suma manual con stock : {suma_con}")
    print(f"Suma manual sin stock : {suma_sin}")
    print(f"Total acumulado       : {suma_con + suma_sin}")

except Exception as e:
    print(f"ERROR: {e}")
