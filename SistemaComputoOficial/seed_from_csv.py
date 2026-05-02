"""
Script de carga inicial desde CSV real.
Lee actas_oficiales_transcripcion.csv y carga:
  - distribucion_territorial
  - recinto_electoral
  - mesa_electoral
"""
import csv
import psycopg2
import sys

DB = {
    "host": "localhost",
    "port": 5432,
    "dbname": "computo_oficial",
    "user": "postgres",
    "password": "electoral2024"
}

CSV_PATH = sys.argv[1] if len(sys.argv) > 1 else "actas_oficiales_transcripcion.csv"

def main():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()

    print("Limpiando tablas de referencia...")
    cur.execute("TRUNCATE mesa_electoral CASCADE;")
    cur.execute("TRUNCATE recinto_electoral CASCADE;")
    cur.execute("TRUNCATE distribucion_territorial CASCADE;")
    conn.commit()

    territorios = {}
    recintos = {}
    mesas = {}

    print(f"Leyendo {CSV_PATH}...")
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ct = int(row["CodigoTerritorial"])
            if ct not in territorios:
                territorios[ct] = {
                    "codigo_territorial": ct,
                    "departamento": row["Departamento"].strip(),
                    "provincia": row["Provincia"].strip(),
                    "municipio": row["Municipio"].strip()
                }

            cr = int(row["CodigoRecinto"])
            if cr not in recintos:
                recintos[cr] = {
                    "recinto_id": cr,
                    "codigo_territorial": ct,
                    "nombre_recinto": row["RecintoNombre"].strip(),
                    "direccion": row["RecintoDireccion"].strip(),
                    "cantidad_mesas": int(row["NumMesas"])
                }

            cm = int(row["CodigoActa"])
            if cm not in mesas:
                mesas[cm] = {
                    "codigo_mesa": cm,
                    "recinto_id": cr,
                    "codigo_territorial": ct,
                    "nro_mesa": int(row["NroMesa"]),
                    "nro_votantes": int(row["VotantesHabilitados"])
                }

    print(f"  Territorios: {len(territorios)}")
    print(f"  Recintos:    {len(recintos)}")
    print(f"  Mesas:       {len(mesas)}")

    print("Insertando distribucion_territorial...")
    for t in territorios.values():
        cur.execute("""
            INSERT INTO distribucion_territorial
                (codigo_territorial, departamento, municipio, provincia)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (codigo_territorial) DO NOTHING
        """, (t["codigo_territorial"], t["departamento"], t["municipio"], t["provincia"]))
    conn.commit()

    print("Insertando recinto_electoral...")
    for r in recintos.values():
        cur.execute("""
            INSERT INTO recinto_electoral
                (recinto_id, codigo_territorial, nombre_recinto, direccion, cantidad_mesas)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (recinto_id) DO NOTHING
        """, (r["recinto_id"], r["codigo_territorial"], r["nombre_recinto"],
              r["direccion"], r["cantidad_mesas"]))
    conn.commit()

    print("Insertando mesa_electoral...")
    for m in mesas.values():
        cur.execute("""
            INSERT INTO mesa_electoral
                (codigo_mesa, recinto_id, codigo_territorial, nro_mesa, nro_votantes)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (codigo_mesa) DO NOTHING
        """, (m["codigo_mesa"], m["recinto_id"], m["codigo_territorial"],
              m["nro_mesa"], m["nro_votantes"]))
    conn.commit()

    # Verificacion
    cur.execute("SELECT COUNT(*) FROM distribucion_territorial")
    print(f"\n✅ distribucion_territorial: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM recinto_electoral")
    print(f"✅ recinto_electoral: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM mesa_electoral")
    print(f"✅ mesa_electoral: {cur.fetchone()[0]}")

    cur.close()
    conn.close()
    print("\nSeed completado.")

if __name__ == "__main__":
    main()