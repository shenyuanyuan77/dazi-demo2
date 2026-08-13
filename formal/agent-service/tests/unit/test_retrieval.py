"""RAG 检索测试 — tokenizer / TF-IDF 检索 / formatContext / driver / build_rag_context.

覆盖验收 §12 RAG 功能 (Recall / 来源正确率 / 降级).
"""

import pytest

from app.retrieval import (
    LocalTfidfDriver,
    build_rag_context,
    create_driver,
    format_context,
    get_by_id,
    list_by_section,
    load_all,
    manifest,
    search,
    tokenize,
)


# ---------- tokenize ----------
def test_tokenize_chinese_bigram():
    tokens = tokenize("减脂期蛋白质")
    assert "减脂" in tokens
    assert "脂期" in tokens


def test_tokenize_chinese_trigram():
    tokens = tokenize("减脂期蛋白质")
    assert "减脂期" in tokens


def test_tokenize_english():
    tokens = tokenize("protein intake BMI")
    assert "protein" in tokens
    assert "intake" in tokens


def test_tokenize_empty():
    assert tokenize("") == []


def test_tokenize_punctuation_split():
    tokens = tokenize("蔬菜，水果。蛋白质")
    assert "蔬菜" in tokens
    assert "水果" in tokens


# ---------- loader ----------
def test_load_all_returns_chunks():
    chunks = load_all()
    assert len(chunks) >= 50  # 膳食+活动+食物+建议
    for c in chunks:
        assert "id" in c and "source" in c and "title" in c and "text" in c


def test_get_by_id():
    c = get_by_id("diet-vegetables_g")
    assert c is not None
    assert "蔬菜" in c["title"]


def test_get_by_id_miss():
    assert get_by_id("nonexistent") is None


def test_list_by_section():
    items = list_by_section("身体活动")
    assert len(items) >= 5
    assert all(c["section"] == "身体活动" for c in items)


def test_manifest():
    m = manifest()
    assert any(item["section"] == "膳食推荐" for item in m)


# ---------- search ----------
def test_search_protein():
    hits = search("减脂期蛋白质", top_k=3)
    assert len(hits) >= 1
    assert all(h["score"] > 0 for h in hits)
    # 应该命中蛋白质相关
    titles = " ".join(h["chunk"]["title"] for h in hits)
    assert "蛋白" in titles or "减脂" in titles


def test_search_vegetables():
    hits = search("蔬菜推荐量", top_k=3)
    assert len(hits) >= 1
    assert any("蔬菜" in h["chunk"]["title"] for h in hits)


def test_search_aerobic():
    hits = search("有氧运动多少分钟", top_k=3)
    assert len(hits) >= 1
    titles = " ".join(h["chunk"]["title"] for h in hits)
    assert "有氧" in titles


def test_search_food_chicken():
    hits = search("鸡胸肉热量", top_k=3)
    assert len(hits) >= 1
    titles = " ".join(h["chunk"]["title"] for h in hits)
    assert "鸡胸" in titles


def test_search_empty_query():
    assert search("", top_k=5) == []


def test_search_no_match():
    hits = search("量子力学", top_k=5)
    assert hits == []


def test_search_top_k_limit():
    hits = search("训练", top_k=2)
    assert len(hits) <= 2


def test_search_sorted_by_score():
    hits = search("蛋白质 减脂 增肌", top_k=5)
    scores = [h["score"] for h in hits]
    assert scores == sorted(scores, reverse=True)


# ---------- format_context ----------
def test_format_context_basic():
    hits = [{"chunk": {"source": "S1", "section": "Sec", "title": "T1", "text": "内容"}, "score": 1.0}]
    out = format_context(hits)
    assert "S1" in out
    assert "T1" in out
    assert "内容" in out


def test_format_context_empty():
    assert format_context([]) == ""


def test_format_context_multiple():
    hits = [
        {"chunk": {"source": "S1", "section": "", "title": "T1", "text": "A"}},
        {"chunk": {"source": "S2", "section": "", "title": "T2", "text": "B"}},
    ]
    out = format_context(hits)
    assert "[#1]" in out and "[#2]" in out


# ---------- driver ----------
def test_create_driver_local():
    d = create_driver({"driver": "local"})
    assert d.name == "local-tfidf"


def test_create_driver_default():
    d = create_driver({})
    assert d.name == "local-tfidf"


def test_create_driver_ragflow_missing_creds():
    with pytest.raises(ValueError):
        create_driver({"driver": "ragflow"})


def test_create_driver_ragflow_valid():
    d = create_driver({"driver": "ragflow", "baseUrl": "https://x.com", "apiKey": "k", "datasetIds": ["d1"]})
    assert d.name == "ragflow"
    assert d.base_url == "https://x.com"


def test_create_driver_unknown():
    with pytest.raises(ValueError):
        create_driver({"driver": "weird"})


@pytest.mark.asyncio
async def test_local_driver_search():
    d = LocalTfidfDriver()
    hits = await d.search("蛋白质", top_k=3)
    assert len(hits) >= 1


@pytest.mark.asyncio
async def test_local_driver_health():
    d = LocalTfidfDriver()
    h = await d.health()
    assert h["ok"] is True
    assert h["chunks"] >= 50
    assert h["driver"] == "local-tfidf"


# ---------- build_rag_context (端到端) ----------
@pytest.mark.asyncio
async def test_build_rag_context_success():
    ctx = await build_rag_context("减脂期蛋白质怎么吃", top_k=3)
    assert ctx["augmented"] is True
    assert len(ctx["context"]) > 0
    assert ctx["driver"] == "local-tfidf"
    assert len(ctx["hits"]) >= 1


@pytest.mark.asyncio
async def test_build_rag_context_no_match():
    ctx = await build_rag_context("量子物理", top_k=3)
    assert ctx["augmented"] is False
    assert ctx["context"] == ""


@pytest.mark.asyncio
async def test_build_rag_context_degrades_on_failure():
    # 用一个会抛异常的 driver 验证降级
    class BoomDriver:
        name = "boom"
        async def search(self, q, top_k=5):
            raise RuntimeError("explode")
        async def health(self):
            return {"ok": False}
    ctx = await build_rag_context("蛋白质", driver=BoomDriver())
    assert ctx["augmented"] is False
    assert "error" in ctx
