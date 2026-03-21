from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # OpenAI
    openai_api_key: str

    # OpenRouter
    openrouter_api_key: str

    # Encryption — must match Next.js ENCRYPTION_SECRET
    encryption_secret: str = "dev-placeholder-not-safe-for-production"

    # Optional tools
    tavily_api_key: str = ""

    # Server
    port: int = 8000
    frontend_url: str = "http://localhost:3000"

    # Agent
    default_model: str = "openai/gpt-4.1-mini"
    max_agent_iterations: int = 20
    max_subagent_iterations: int = 15
    daily_query_limit: int = 50


settings = Settings()
