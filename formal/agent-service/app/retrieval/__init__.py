# app/retrieval/__init__.py
# 检索增强 (RAG) — 高层入口.
#
# 用法:
#   from app.retrieval import build_rag_context
#   ctx = await build_rag_context("减脂期蛋白质", top_k=5)
#   # ctx = {"context": "...", "hits": [...], "augmented": True, "driver": "local-tfidf"}
from __future__ import annotations

import logging
from typing import Any

from app.core import get_settings
from app.retrieval.engine import (
    LocalTfidfDriver,
    RagflowDriver,
    create_driver,
    format_context,
    search,
    tokenize,
)
from app.retrieval.loader import get_by_id, list_by_section, load_all, manifest

logger = logging.getLogger(__name__)


def _build_driver_from_settings() -> Any:
    """根据 settings 构造 driver: 配了 RAGFlow 用 ragflow, 否则 local."""
    s = get_settings()
    if s.ragflow_configured:
        return RagflowDriver(
            base_url=s.ragflow_base_url,
            api_key=s.ragflow_api_key,
            dataset_ids=[s.ragflow_kb_diet, s.ragflow_kb_training, s.ragflow_kb_faq]
            if any([s.ragflow_kb_diet, s.ragflow_kb_training, s.ragflow_kb_faq]) else None,
            timeout=float(s.ragflow_timeout_seconds),
        )
    return LocalTfidfDriver()


async def build_rag_context(
    query: str,
    *,
    top_k: int = 5,
    driver: Any | None = None,
) -> dict[str, Any]:
    """端到端 RAG: query -> 召回 -> formatContext. 失败降级到空上下文 (不阻断主流程)."""
    drv = driver or _build_driver_from_settings()
    try:
        hits = await drv.search(query, top_k=top_k)
        ctx = format_context(hits)
        return {
            "context": ctx,
            "hits": hits,
            "augmented": bool(ctx),
            "driver": getattr(drv, "name", "unknown"),
        }
    except Exception as e:  # noqa: BLE001 - RAG 失败必须降级, 不能拖垮整个 turn
        logger.warning("rag_failed error=%s driver=%s", e, getattr(drv, "name", "unknown"))
        return {
            "context": "",
            "hits": [],
            "augmented": False,
            "driver": getattr(drv, "name", "unknown"),
            "error": str(e),
        }


__all__ = [
    "build_rag_context",
    "search", "format_context", "tokenize",
    "create_driver", "LocalTfidfDriver", "RagflowDriver",
    "load_all", "get_by_id", "list_by_section", "manifest",
]
