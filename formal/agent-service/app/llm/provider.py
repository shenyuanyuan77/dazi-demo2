"""LLM Provider — 复用 LangChain 的 ChatOpenAI 与小米 MiMo 对接。

MiMo 完全 OpenAI 兼容, 因此 \'切换到 DeepSeek/Qwen/OpenAI\' 只需改 `base_url` + `model` + `api_key`,
提供 `build_llm()` / `build_fast_llm()` 两个工厂, 上层 (graph node) 不必关心 vendor。
"""

from __future__ import annotations

from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from app.core.config import Settings
from app.core.exceptions import ProviderError


def build_llm(settings: Settings, *, model: str | None = None, **kwargs: Any) -> BaseChatModel:
    """构造一个 ChatOpenAI 实例, 默认走 MiMo 主模型 (v2.5, 多模态)。

    M2 的 LangGraph 节点会用此工厂取 LLM, 切换 vendor 无需改动业务。
    """
    if not settings.llm_configured:
        raise ProviderError("LLM 未配置 (MIMO_API_KEY 缺失)", kind=ProviderError.AUTH_FAILED)

    return ChatOpenAI(
        model=model or settings.mimo_model,
        api_key=settings.mimo_api_key,
        base_url=settings.mimo_chat_endpoint,
        timeout=settings.mimo_timeout_seconds,
        max_retries=2,  # LangChain 自带指数退避
        **kwargs,
    )


def build_fast_llm(settings: Settings, **kwargs: Any) -> BaseChatModel:
    """走 Flash 模型, 用于意图路由 / 槽位提取等廉价任务 (无图片)。"""
    return build_llm(settings, model=settings.mimo_fast_model, **kwargs)


def build_model_for_request(
    settings: Settings, *, has_images: bool, **kwargs: Any
) -> BaseChatModel:
    """对应原 fitness_agent_runtime.selectModel 的确定性路由:
    有图 -> mimo-v2.5, 无图 -> mimo-v2-flash.
    """
    return build_llm(settings, model=None if has_images else settings.mimo_fast_model, **kwargs)


__all__ = [
    "build_llm",
    "build_fast_llm",
    "build_model_for_request",
]
