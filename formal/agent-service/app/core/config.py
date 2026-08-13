"""集中配置 — 由 pydantic-settings 从环境变量加载。

凡是从原 Node config.js 迁移过来的键, 命名尽量贴近原变量名 (MIMO_*) 便于运维对齐。
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """所有运行时配置。

    `toml`/`.env` 之外的所有敏感字段(MIMO_API_KEY 等)只从环境变量加载，
    永不写入代码。
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------ LLM (MiMo 优先) ------------
    mimo_api_key: str = ""
    mimo_base_url: str = "https://api.xiaomimimo.com/v1"
    mimo_model: str = "mimo-v2.5"        # 多模态
    mimo_fast_model: str = "mimo-v2-flash"  # 纯文本
    mimo_timeout_seconds: int = 60

    # ------------ HTTP ------------
    agent_host: str = "0.0.0.0"
    agent_port: int = 8787
    agent_log_level: str = "INFO"

    # ------------ RAGFlow (M3 启用, 现在留空 -> retriever 节点降级) ------------
    ragflow_base_url: str = ""
    ragflow_api_key: str = ""
    ragflow_kb_diet: str = ""
    ragflow_kb_training: str = ""
    ragflow_kb_faq: str = ""
    ragflow_score_threshold: float = 0.35
    ragflow_top_k: int = 5
    ragflow_timeout_seconds: int = 15

    # ------------ 服务网格 ------------
    agent_internal_token: str = ""

    @field_validator("mimo_base_url")
    @classmethod
    def _normalize_base_url(cls, v: str) -> str:
        v = v.rstrip("/")
        # 与原 Node config normalizeMiMoEndpoint 一致: 用户给到 /v1 也行, 给全路径也行
        if v.endswith("/v1"):
            return v
        if v.endswith("/chat/completions"):
            return v[: -len("/chat/completions")]
        return v

    @property
    def mimo_chat_endpoint(self) -> str:
        """LangChain ChatOpenAI 的 base_url 应到 /v1。"""
        return self.mimo_base_url

    @property
    def llm_configured(self) -> bool:
        return bool(self.mimo_api_key)

    @property
    def ragflow_configured(self) -> bool:
        return bool(self.ragflow_base_url and self.ragflow_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """单例 Settings, 测试可通过 `get_settings.cache_clear()` 重置。"""
    return Settings()
