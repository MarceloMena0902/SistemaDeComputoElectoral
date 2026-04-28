from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:electoral2024@localhost:5000/computo_oficial"
    )
    DATABASE_URL_READ: str = (
        "postgresql+asyncpg://postgres:electoral2024@localhost:5001/computo_oficial"
    )
    SECRET_KEY: str = "electoral-secret-key-2024"
    RUN_MIGRATIONS: bool = True

    model_config = {"env_file": ".env"}


settings = Settings()
