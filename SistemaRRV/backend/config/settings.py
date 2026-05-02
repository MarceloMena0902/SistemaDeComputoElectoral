from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # MongoDB (sin autenticación para pruebas)
    mongodb_url: str = "mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0"
    mongodb_database: str = "computo_electoral_rrv"
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # OCR
    tesseract_path: str = "tesseract"
    ocr_confidence_threshold: float = 80.0
    
    # Uploads
    upload_dir: str = "uploads/actas"
    max_file_size_mb: int = 10
    
    # Logs
    log_level: str = "INFO"
    
    class Config:
        env_file = ".env"

settings = Settings()
