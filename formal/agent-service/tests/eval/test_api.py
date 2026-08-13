"""FastAPI 接口冒烟测试."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    # 触发 lifespan -> 编译图
    with TestClient(app) as c:
        yield c


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["service"] == "fitness-agent-service"
    assert "llm_configured" in body


def test_turn_unsupported(client):
    resp = client.post(
        "/agent/turn",
        json={"userId": "u1", "message": "帮我写股票预测"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "只支持" in body["answer"]["content"]


def test_turn_empty_message_rejected(client):
    resp = client.post("/agent/turn", json={"userId": "u1", "message": ""})
    assert resp.status_code == 200
    assert resp.json()["ok"] is False  # empty_message_and_images


def test_turn_accepts_camel_case_aliases(client):
    # 云函数 forward 时用 camelCase; UNSUPPORTED 走 finalize 不需要 pendingWrite
    resp = client.post(
        "/agent/turn",
        json={
            "userId": "u1",
            "sessionId": "s1",
            "message": "帮我写股票预测",
            "clientMessageId": "msg-001",
        },
    )
    body = resp.json()
    assert body["ok"] is True
    assert "只支持" in body["answer"]["content"]
    assert body["answer"]["requestId"] == "msg-001"


def test_internal_token_protects_when_configured(client, monkeypatch):
    # 配置 token 后, 缺 token 的请求应 401
    from app.core import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("AGENT_INTERNAL_TOKEN", "secret-xyz")
    try:
        resp = client.post(
            "/agent/turn",
            json={"userId": "u1", "message": "确认"},
        )
        assert resp.status_code == 401

        # 带 token 应通过
        resp = client.post(
            "/agent/turn",
            json={"userId": "u1", "message": "确认"},
            headers={"X-Internal-Token": "secret-xyz"},
        )
        assert resp.status_code == 200
    finally:
        monkeypatch.delenv("AGENT_INTERNAL_TOKEN", raising=False)
        get_settings.cache_clear()
