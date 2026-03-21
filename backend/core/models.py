from dataclasses import dataclass


@dataclass
class ModelDefinition:
    id: str
    name: str
    provider: str
    cost_tier: str  # "free" | "low" | "medium" | "high"


ALL_MODELS: list[ModelDefinition] = [
    # OpenAI
    ModelDefinition("openai/gpt-4.1-mini", "GPT-4.1 Mini", "OpenAI", "low"),
    ModelDefinition("openai/gpt-4.1-nano", "GPT-4.1 Nano", "OpenAI", "free"),
    ModelDefinition("openai/gpt-4.1", "GPT-4.1", "OpenAI", "medium"),
    ModelDefinition("openai/o4-mini", "o4 Mini", "OpenAI", "medium"),
    # Anthropic
    ModelDefinition("anthropic/claude-sonnet-4-5", "Claude Sonnet 4.5", "Anthropic", "medium"),
    ModelDefinition("anthropic/claude-haiku-4-5", "Claude Haiku 4.5", "Anthropic", "low"),
    ModelDefinition("anthropic/claude-opus-4", "Claude Opus 4", "Anthropic", "high"),
    # Google
    ModelDefinition("google/gemini-2.0-flash-001", "Gemini 2.0 Flash", "Google", "low"),
    ModelDefinition("google/gemini-2.5-pro-preview-03-25", "Gemini 2.5 Pro", "Google", "high"),
    # Meta
    ModelDefinition("meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B", "Meta", "low"),
    ModelDefinition("meta-llama/llama-3.1-8b-instruct", "Llama 3.1 8B", "Meta", "free"),
    # Mistral
    ModelDefinition("mistralai/mistral-small-3.1-24b-instruct", "Mistral Small 3.1", "Mistral", "low"),
    # DeepSeek
    ModelDefinition("deepseek/deepseek-chat", "DeepSeek V3", "DeepSeek", "low"),
    ModelDefinition("deepseek/deepseek-r1", "DeepSeek R1", "DeepSeek", "medium"),
]

DEFAULT_MODEL_ID = "openai/gpt-4.1-mini"

_model_map = {m.id: m for m in ALL_MODELS}


def get_model_by_id(model_id: str) -> ModelDefinition | None:
    return _model_map.get(model_id)


def is_valid_model(model_id: str) -> bool:
    return model_id in _model_map
