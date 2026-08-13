"""FastAPI 入口 - 对外 HTTP.

调用方: 微信云函数 mcloud 的 ai/send handler (瘦身转发).
不直接对小程序前端暴露.
"""

from __future__ import annotations

import secrets
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.core import configure_logging, get_logger, get_settings
from app.core.exceptions import AgentError, ProviderError
from app.graph import build_fitness_graph
from app.graph.state import TurnInput


# -------------------- 请求/响应模型 --------------------
class TurnRequest(BaseModel):
    """对应 ai_service.sendMessage 的入参 (云函数 forward 时透明透传)."""

    user_id: str = Field(alias="userId")
    session_id: str | None = Field(default=None, alias="sessionId")
    message: str = ""
    images: list[str] = Field(default_factory=list)
    image_urls: list[str] = Field(default_factory=list, alias="imageUrls")
    image_data: list[str] = Field(default_factory=list, alias="imageData")
    profile: dict[str, Any] = Field(default_factory=dict)
    history: list[dict[str, Any]] = Field(default_factory=list)
    recent_logs: list[dict[str, Any]] = Field(default_factory=list, alias="recentLogs")
    memory: list[dict[str, Any]] = Field(default_factory=list)
    client_message_id: str = Field(default="", alias="clientMessageId")
    recognition_id: str = Field(default="", alias="recognitionId")
    intent: dict[str, Any] = Field(default_factory=dict)
    previous_state: dict[str, Any] = Field(default_factory=dict, alias="previousState")

    model_config = {"populate_by_name": True}


class TurnResponse(BaseModel):
    """HTTP 响应壳."""
    ok: bool
    answer: dict[str, Any] | None = None
    error: str = ""
    trace: list[dict[str, Any]] = Field(default_factory=list)


class HealthResponse(BaseModel):
    service: str
    version: str
    llm_configured: bool
    ragflow_configured: bool


# -------------------- App 生命周期 --------------------
@asynccontextmanager
async def lifespan(_app: FastAPI):  # noqa: ANN202 - FastAPI signature
    settings = get_settings()
    configure_logging(settings.agent_log_level)
    logger = get_logger("lifespan")
    logger.info(
        "agent_service.starting",
        llm_configured=settings.llm_configured,
        ragflow_configured=settings.ragflow_configured,
    )
    # 预编译图 (LangGraph).
    _app.state.graph = build_fitness_graph()
    if not settings.llm_configured:
        logger.warning("agent_service.mimo_key_missing")
    yield
    logger.info("agent_service.stopping")


app = FastAPI(
    title="Fitness Agent Service",
    version="0.1.0",
    lifespan=lifespan,
)

# 进程级监控指标 (§31)
_METRICS: dict[str, Any] = {"turns": 0, "errors": 0, "latency_ms_sum": 0.0, "intents": {}}


# -------------------- 中间件: 内部 token 鉴权 --------------------
def _check_internal_token(x_internal_token: str | None) -> None:
    expected = get_settings().agent_internal_token
    if not expected:
        return  # 未配置 -> 开发模式放行
    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_internal_token",
        )


# -------------------- 健康检查 --------------------
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    s = get_settings()
    return HealthResponse(
        service="fitness-agent-service",
        version=app.version,
        llm_configured=s.llm_configured,
        ragflow_configured=s.ragflow_configured,
    )


# -------------------- 监控指标 (§31 生产监控) --------------------
@app.get("/metrics")
async def metrics() -> dict[str, Any]:
    """Prometheus 风格的监控指标 (拉取式).

    返回当前进程的累计计数: turn 总数 / intent 分布 / 错误数 / 平均延迟.
    生产环境由 Prometheus scrape 此端点.
    """
    m = _METRICS
    return {
        "turns_total": m["turns"],
        "errors_total": m["errors"],
        "intent_distribution": dict(m["intents"]),
        "avg_turn_latency_ms": round(m["latency_ms_sum"] / m["turns"], 1) if m["turns"] else 0,
        "llm_configured": get_settings().llm_configured,
        "ragflow_configured": get_settings().ragflow_configured,
    }


def _record_turn_metrics(*, intent: str, latency_ms: float, ok: bool) -> None:
    """记录单 turn 指标 (由 agent_turn handler 调用)."""
    m = _METRICS
    m["turns"] += 1
    m["latency_ms_sum"] += latency_ms
    if not ok:
        m["errors"] += 1
    m["intents"][intent] = m["intents"].get(intent, 0) + 1


# -------------------- 主接口: /agent/turn --------------------
@app.post("/agent/turn", response_model=TurnResponse)
async def agent_turn(  # noqa: C901
    req: TurnRequest,
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> TurnResponse:
    """处理一个对话回合.

    返回:
        - 成功: {ok: true, answer: {...}, trace: [...]}
        - 失败: {ok: false, error: "..."}
    """
    _check_internal_token(x_internal_token)

    import time
    t0 = time.monotonic()

    images = list(req.images or []) + list(req.image_data or [])
    has_any_image = bool(images) or bool(req.image_urls)

    # 简单入参校验 (与原 ai_service.sendMessage 一致)
    if not req.message and not has_any_image:
        return TurnResponse(ok=False, error="empty_message_and_images")

    turn_input: TurnInput = {
        "user_id": req.user_id,
        "session_id": req.session_id or "",
        "message": req.message,
        "images": req.image_data or req.image_urls or req.images,
        "image_data": req.image_data,
        "profile": req.profile,
        "history": req.history,
        "recent_logs": req.recent_logs,
        "memory": req.memory,
        "client_message_id": req.client_message_id,
        "recognition_id": req.recognition_id,
        "intent_hint": req.intent,
        "previous_state": req.previous_state,
    }

    initial_state = {
        "input": turn_input,
        "trace": [],
        "tool_calls": [],
        "validation_errors": [],
        "pending_write": None,
        "confirmed_by_user": False,
    }

    try:
        final_state = await app.state.graph.ainvoke(initial_state)
    except ProviderError as e:
        _record_turn_metrics(intent="error", latency_ms=(time.monotonic() - t0) * 1000, ok=False)
        return TurnResponse(ok=False, error=e.render_user_message())
    except AgentError as e:
        _record_turn_metrics(intent="error", latency_ms=(time.monotonic() - t0) * 1000, ok=False)
        return TurnResponse(ok=False, error=str(e))
    except Exception as e:  # noqa: BLE001 - HTTP 入口必须收敛异常
        logger = get_logger("agent_turn")
        logger.exception("agent_turn.uncaught", error=str(e))
        _record_turn_metrics(intent="error", latency_ms=(time.monotonic() - t0) * 1000, ok=False)
        return TurnResponse(ok=False, error=f"agent_internal_error:{type(e).__name__}")

    answer = final_state.get("answer")
    latency_ms = (time.monotonic() - t0) * 1000
    intent_val = ""
    if final_state.get("intent"):
        intent_val = getattr(final_state["intent"], "value", str(final_state["intent"]))
    if answer is None:
        _record_turn_metrics(intent=intent_val or "no_answer", latency_ms=latency_ms, ok=False)
        return TurnResponse(
            ok=False, error="answer_not_generated",
            trace=final_state.get("trace", []),
        )

    _record_turn_metrics(intent=intent_val or "unknown", latency_ms=latency_ms, ok=True)
    return TurnResponse(
        ok=True,
        answer=answer.to_miniprogram_json(),
        trace=final_state.get("trace", []),
    )


def run() -> None:
    """供 `python -m app.main` / project script 启动."""
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.agent_host,
        port=settings.agent_port,
        log_level=settings.agent_log_level.lower(),
        reload=False,
    )


if __name__ == "__main__":
    run()
