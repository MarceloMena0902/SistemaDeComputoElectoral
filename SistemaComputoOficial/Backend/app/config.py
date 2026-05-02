from pathlib import Path
from pydantic_settings import BaseSettings


def _default_csv_path() -> str:
    """Busca el CSV en rutas conocidas (Docker y desarrollo local)."""
    candidates = [
        "/app/data/actas_oficiales_transcripcion.csv",
        str(Path(__file__).parent.parent.parent.parent / "automatizacion/data/actas_oficiales_transcripcion.csv"),
        str(Path(__file__).parent.parent.parent.parent / "automatizacion/data/actas_oficiales_transcripcion_3000.csv"),
        "/app/data/oficial/actas_conteo.xlsx",
        str(Path(__file__).parent.parent.parent.parent / "automatizacion/data/oficial/actas_conteo.xlsx"),
    ]
    for p in candidates:
        if Path(p).exists():
            return p
    return candidates[0]


class Settings(BaseSettings):
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:electoral2024@localhost:5000/computo_oficial"
    )
    DATABASE_URL_READ: str = (
        "postgresql+asyncpg://postgres:electoral2024@localhost:5001/computo_oficial"
    )
    SECRET_KEY:     str  = "electoral-secret-key-2024"
    RUN_MIGRATIONS: bool = True
    CSV_PATH:       str  = ""  # Se resuelve en runtime con _default_csv_path()
    SELENIUM_LIMIT: int  = 15  # Primeras N filas procesadas "visualmente"
    BULK_CONCURRENCY: int = 4  # Workers paralelos para carga masiva

    model_config = {"env_file": ".env"}

    def get_csv_path(self) -> str:
        if self.CSV_PATH and Path(self.CSV_PATH).exists():
            return self.CSV_PATH
        return _default_csv_path()


settings = Settings()
