# app/retrieval/engine.py
# 检索器：内置 TF-IDF + 关键词评分；可切换 RAGFlow 远程召回.
#
# 1:1 移植自 Node retrieval.js (tokenize/scoreChunk/buildIdf/search/formatContext/createDriver).
# 中文分词用 n-gram (2-3 字), 零依赖.
from __future__ import annotations

import logging
import math
import re
from typing import Any, Protocol

from app.retrieval.loader import load_all

logger = logging.getLogger(__name__)


# ============================================================
# 分词 — 中文 n-gram + 英文 split
# ============================================================
_PUNCT_RE = re.compile(r"[\s,;.!?，。！？；：、（）()【】\[\]\"'`]+")
_NON_CN_RE = re.compile(r"[^\u4e00-\u9fa5]")


def tokenize(text: str) -> list[str]:
    """中文 2/3-gram + 英文 split。返回去重后的 token 列表。"""
    if not text:
        return []
    raw = text.lower()
    tokens: set[str] = set()
    # 英文/数字
    for w in _PUNCT_RE.split(raw):
        if w and len(w) > 1:
            tokens.add(w)
    # 中文 2-gram + 3-gram
    cn = _NON_CN_RE.sub("", raw)
    for i in range(len(cn) - 1):
        tokens.add(cn[i : i + 2])
    for i in range(len(cn) - 2):
        tokens.add(cn[i : i + 3])
    return list(tokens)


def _build_tf(tokens: list[str]) -> dict[str, int]:
    tf: dict[str, int] = {}
    for t in tokens:
        tf[t] = tf.get(t, 0) + 1
    return tf


# ============================================================
# TF-IDF 索引 (懒加载)
# ============================================================
class _Index:
    def __init__(self) -> None:
        self.chunks: list[dict[str, Any]] = []
        self.chunk_tf: list[dict[str, int]] = []
        self.idf: dict[str, float] = {}
        self._built = False

    def build(self) -> None:
        if self._built:
            return
        chunks = load_all()
        self.chunks = chunks
        self.chunk_tf = []
        for c in chunks:
            text = " ".join([
                str(c.get("text", "")), str(c.get("title", "")),
                " ".join(c.get("tags") or []),
            ])
            self.chunk_tf.append(_build_tf(tokenize(text)))
        # idf
        df: dict[str, int] = {}
        for tf in self.chunk_tf:
            for t in tf:
                df[t] = df.get(t, 0) + 1
        total = len(chunks) or 1
        self.idf = {t: math.log(1 + total / d) for t, d in df.items()}
        self._built = True


_INDEX = _Index()


def _score_chunk(idx: int, query_tf: dict[str, int], index: _Index) -> tuple[float, int]:
    chunk_tf = index.chunk_tf[idx]
    score = 0.0
    matched = 0
    for term, qf in query_tf.items():
        cf = chunk_tf.get(term, 0)
        if cf > 0:
            score += cf * (qf * index.idf.get(term, 1.0))
            matched += 1
    chunk = index.chunks[idx]
    # 标签命中加权
    for tag in chunk.get("tags") or []:
        for t in tokenize(str(tag)):
            if t in query_tf:
                score += 1.5
    # 标题命中加权
    for t in tokenize(str(chunk.get("title", ""))):
        if t in query_tf:
            score += 2.0
    return score, matched


def search(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    """本地 TF-IDF 检索。返回 [{chunk, score, matched}, ...]。"""
    index = _INDEX
    index.build()
    q_tf = _build_tf(tokenize(query))
    if not q_tf:
        return []
    hits = []
    for i, chunk in enumerate(index.chunks):
        score, matched = _score_chunk(i, q_tf, index)
        if score > 0:
            hits.append({"chunk": dict(chunk), "score": round(score, 4), "matched": matched})
    hits.sort(key=lambda h: h["score"], reverse=True)
    return hits[:top_k]


def format_context(hits: list[dict[str, Any]]) -> str:
    """把检索结果格式化为模型可读的"参考片段"。"""
    if not hits:
        return ""
    parts = []
    for i, hit in enumerate(hits, 1):
        c = hit.get("chunk") or {}
        header = f"[#{i}] 来源={c.get('source', '')} · 章节={c.get('section', '')} · 标题={c.get('title', '')}"
        parts.append(f"{header}\n{c.get('text', '')}\n")
    return "\n".join(parts)


# ============================================================
# Driver 抽象
# ============================================================
class RetrievalDriver(Protocol):
    name: str

    async def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]: ...
    async def health(self) -> dict[str, Any]: ...


class LocalTfidfDriver:
    name = "local-tfidf"

    async def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        return search(query, top_k)

    async def health(self) -> dict[str, Any]:
        _INDEX.build()
        return {"ok": True, "chunks": len(_INDEX.chunks), "driver": "local-tfidf"}


class RagflowDriver:
    name = "ragflow"

    def __init__(self, base_url: str, api_key: str, dataset_ids: list[str] | None = None,
                 *, timeout: float = 15.0) -> None:
        if not base_url or not api_key:
            raise ValueError("ragflow driver requires base_url + api_key")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.dataset_ids = dataset_ids or []
        self.timeout = timeout

    async def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        import httpx
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/api/v1/retrieval/recall",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={"question": query, "dataset_ids": self.dataset_ids, "top_k": top_k},
            )
            resp.raise_for_status()
            data = resp.json()
        out = []
        for item in (data.get("data") or []):
            out.append({
                "chunk": {
                    "id": item.get("id", f"ragflow-{item.get('title', '')}"),
                    "source": item.get("dataset_name", "RAGFlow"),
                    "sourceUrl": self.base_url,
                    "title": item.get("title", ""),
                    "section": item.get("section", ""),
                    "text": item.get("content") or item.get("text", ""),
                    "tags": item.get("keywords") or [],
                },
                "score": item.get("score", 0),
            })
        return out

    async def health(self) -> dict[str, Any]:
        return {"ok": True, "chunks": None, "driver": "ragflow", "baseUrl": self.base_url}


def create_driver(options: dict[str, Any] | None = None) -> RetrievalDriver:
    """工厂：driver = "local" | "ragflow"。"""
    opts = options or {}
    driver = opts.get("driver", "local")
    if driver == "local":
        return LocalTfidfDriver()
    if driver == "ragflow":
        return RagflowDriver(
            base_url=opts.get("baseUrl", ""),
            api_key=opts.get("apiKey", ""),
            dataset_ids=opts.get("datasetIds"),
            timeout=float(opts.get("timeout", 15.0)),
        )
    raise ValueError(f"unknown retrieval driver: {driver}")


__all__ = [
    "tokenize", "search", "format_context",
    "RetrievalDriver", "LocalTfidfDriver", "RagflowDriver", "create_driver",
]
