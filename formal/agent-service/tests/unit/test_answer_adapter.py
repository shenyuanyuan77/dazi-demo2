"""adapter 协议测试 — answer 出口必须与小程序前端 1:1.

失败就意味着前端 AI_CHAT 卡片渲染会崩, 必须红.
"""

from app.adapters import (
    Answer,
    PendingWrite,
    build_answer,
    enforce_answer_contract,
    proposal_from_pending_write,
)
from app.adapters.miniprogram_adapter import (
    _remove_premature_write_claim,
    answer_title,
    answer_type,
)
from app.types.agent_types import (
    AgentIntent,
    PendingWriteStatus,
    PendingWriteType,
)


# ---------- proposal_from_pending_write ----------

def _diet_pending(pid="pw1"):
    return PendingWrite(
        id=pid,
        type=PendingWriteType.DIET_LOG,
        status=PendingWriteStatus.WAITING_CONFIRM,
        data={
            "date": "2026-07-22",
            "meal": "breakfast",
            "items": [{"name": "鸡蛋", "calories": 80}],
            "source": "chat",
        },
        summary_for_user="早餐: 鸡蛋(80 kcal)",
    )


def test_diet_pending_becomes_dietLog_proposal():
    p = proposal_from_pending_write(_diet_pending())
    assert p is not None
    assert p.type == "dietLog"
    assert p.status == "pending"
    assert p.id == "pw1"
    assert p.payload["meal"] == "breakfast"
    assert p.payload["harnessWriteType"] == "diet_log"
    assert p.payload["pendingWriteId"] == "pw1"


def test_non_waiting_pending_returns_none():
    pw = PendingWrite(
        id="x", type=PendingWriteType.DIET_LOG,
        status=PendingWriteStatus.CONFIRMED,
    )
    assert proposal_from_pending_write(pw) is None


def test_none_returns_none():
    assert proposal_from_pending_write(None) is None


# ---------- training_log proposal (重点测 subtitle 装配) ----------

def test_training_log_proposal_subtitle_assembly():
    pw = PendingWrite(
        id="tr1",
        type=PendingWriteType.TRAINING_LOG,
        status=PendingWriteStatus.WAITING_CONFIRM,
        data={
            "date": "2026-07-22",
            "items": [
                {"exerciseName": "卧推", "sets": 4, "reps": 8, "weightKg": 60},
                {"exerciseName": "跑步", "durationMin": 30},
            ],
        },
        summary_for_user="训练记录",
    )
    p = proposal_from_pending_write(pw)
    assert p is not None
    assert p.type == "workoutPlan"
    ex = p.payload["exercises"]
    # 卧推 subtitle: "4 组, 每组 8 次, 60 kg"
    assert "4 组" in ex[0]["subtitle"]
    assert "每组 8 次" in ex[0]["subtitle"]
    assert "60 kg" in ex[0]["subtitle"]
    # 跑步无 reps, 用 durationMin
    assert ex[1]["sets"][0]["reps"] == "30分钟"


# ---------- enforce_answer_contract ----------

def test_contract_strips_premature_write_claim():
    pending = _diet_pending()
    base = build_answer(
        intent=AgentIntent.DIET_RECORD,
        reply="好的, 我已经保存了你的早餐。",  # 撒谎!
        pending_write=pending,
    )
    # 经 contract 后, "已经保存" 应被洗掉 (修复了原 Node 漏匹配的 `经` 字变体)
    assert "已经保存了你" not in base.content
    assert "保存了你的早餐" not in base.content
    # 且应追加确认提示
    assert "待确认项" in base.content


def test_contract_strips_other_premature_claims():
    """覆盖多种宣称已完成的句式, 防止回归."""
    pending = _diet_pending()
    for bad_text, marker in [
        ("已记录完成。", "已记录完成"),
        ("保存成功了!", "保存成功了!"),
        ("已经写入完成。", "已经写入完成"),
        ("已更新你的档案。", "已更新你的档案"),
    ]:
        base = build_answer(
            intent=AgentIntent.DIET_RECORD,
            reply=bad_text,
            pending_write=pending,
        )
        assert marker not in base.content, f"未被清洗: {marker} -> {base.content!r}"


def test_contract_appends_confirmation_prompt_when_missing():
    pending = _diet_pending()
    base = build_answer(
        intent=AgentIntent.DIET_RECORD,
        reply="已识别为早餐 80 千卡。",  # 没"确认/保存"字样
        pending_write=pending,
    )
    assert "待确认项" in base.content


def test_unsupported_scope_expansion_replaced():
    base = build_answer(
        intent=AgentIntent.UNSUPPORTED,
        reply="好的, 我来帮你写论文。",
        pending_write=None,
    )
    assert "写论文" not in base.content
    assert "只支持" in base.content


def test_remove_premature_write_claim_helper():
    # 修复后正则容忍 "经字变体" 且 `[^。！？\n]*` 会贪婪吞掉后续到标点的全部修饰词,
    # 这是预期行为收紧 — 防止 "已经记录完成,不要担心" 这类混合句漏过.
    assert _remove_premature_write_claim("已经记录完成,不要担心。") == ""
    assert _remove_premature_write_claim("保存成功了!") == ""
    # 含独立句的尾部不连带洗
    assert _remove_premature_write_claim("好的。已经记录完成。") == "好的。"
    # 无关文本不动
    assert _remove_premature_write_claim("今天天气不错。") == "今天天气不错。"


# ---------- 类型/标题映射 ----------

def test_answer_type_mapping():
    assert answer_type(AgentIntent.DIET_RECORD) == "diet"
    assert answer_type(AgentIntent.DIET_SUGGESTION) == "diet"
    assert answer_type(AgentIntent.TRAINING_RECORD) == "training"
    assert answer_type(AgentIntent.TRAINING_PLAN_CREATE) == "training"
    assert answer_type(AgentIntent.BODY_ANALYSIS) == "general"
    assert answer_type(AgentIntent.UNSUPPORTED) == "general"


def test_answer_title_mapping():
    assert answer_title(AgentIntent.DIET_RECORD) == "饮食记录确认"
    assert answer_title(AgentIntent.BODY_ANALYSIS) == "身体数据分析"
    assert answer_title(AgentIntent.UNSUPPORTED) == "暂不支持"


# ---------- JSON 序列化为 camelCase (前端兼容) ----------

def test_answer_to_miniprogram_json_camelcase():
    base = build_answer(
        intent=AgentIntent.DIET_RECORD,
        reply="已识别。请确认。",
        pending_write=_diet_pending(),
        model="agent-service-m1",
        request_id="req-1",
    )
    out = base.to_miniprogram_json()
    # request_id 序列化为 requestId
    assert out["requestId"] == "req-1"
    # payload.proposals 存在且是数组
    assert isinstance(out["payload"]["proposals"], list)
    assert len(out["payload"]["proposals"]) == 1
    # agentState.currentTask 是 camelCase
    assert "currentTask" in out["payload"]["agentState"]
    # pendingWrite 是 camelCase
    assert "pendingWrite" in out["payload"]["agentState"]
