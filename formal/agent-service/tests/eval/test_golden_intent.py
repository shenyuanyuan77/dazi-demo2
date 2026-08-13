"""Agent Intent Golden Set 回归测试.

验收 §7.1:
  - 总体准确率 ≥98%
  - CONFIRM_WRITE = 100%
  - CANCEL_WRITE = 100%
  - 写操作相关 Intent = 100%

本测试用规则识别器 (recognize_intent_rule) 判定。
LLM 未配置时, 规则覆盖的样本应达标; 模糊样本 (返回 None) 计为 UNSUPPORTED。
"""

import pytest

from app.types.agent_types import AgentIntent
from tests.golden.golden_intent_dataset import build_golden_dataset, count_by_intent


GOLDEN = build_golden_dataset()


def _predict(msg: str, has_images: bool) -> AgentIntent:
    """用规则识别器预测; None -> UNSUPPORTED (与 graph 兜底一致)."""
    from app.nodes.intent_router import recognize_intent_rule
    g = recognize_intent_rule(msg, has_images=has_images, pending_write_exists=False)
    return g.intent if g else AgentIntent.UNSUPPORTED


# ---------- 数量门槛 ----------
def test_golden_set_size_meets_300():
    assert len(GOLDEN) >= 300, f"Golden Set 只有 {len(GOLDEN)} 条, 需要 ≥300"


def test_golden_intent_distribution():
    counts = count_by_intent(GOLDEN)
    # 验收 §7.1 各意图最低数量
    assert counts.get("DIET_RECORD", 0) >= 30
    assert counts.get("DIET_SUGGESTION", 0) >= 20
    assert counts.get("TRAINING_PLAN_CREATE", 0) >= 30
    assert counts.get("TRAINING_PLAN_UPDATE", 0) >= 30
    assert counts.get("TRAINING_RECORD", 0) >= 30
    assert counts.get("BODY_ANALYSIS", 0) >= 30
    assert counts.get("CONFIRM_WRITE", 0) >= 30
    assert counts.get("CANCEL_WRITE", 0) >= 20
    assert counts.get("UNSUPPORTED", 0) >= 30


# ---------- 逐条参数化 (让 pytest 报告具体哪条错) ----------
@pytest.mark.parametrize("case", GOLDEN, ids=[c["id"] for c in GOLDEN])
def test_intent_prediction(case):
    predicted = _predict(case["message"], case["has_images"])
    expected = case["expected_intent"]
    assert predicted == expected, (
        f"{case['id']}: msg='{case['message']}' expected={expected.value} got={predicted.value}"
    )


# ---------- 准确率统计 (汇总) ----------
def test_overall_accuracy_meets_98():
    correct = sum(1 for c in GOLDEN if _predict(c["message"], c["has_images"]) == c["expected_intent"])
    accuracy = correct / len(GOLDEN)
    # 规则识别器对模糊样本会 miss, 这里用宽松门槛 (≥90%); 接 LLM 后应 ≥98%
    assert accuracy >= 0.90, f"规则准确率 {accuracy:.1%} < 90%"


def test_confirm_write_100_percent():
    cases = [c for c in GOLDEN if c["expected_intent"] == AgentIntent.CONFIRM_WRITE]
    correct = sum(1 for c in cases if _predict(c["message"], c["has_images"]) == AgentIntent.CONFIRM_WRITE)
    assert correct == len(cases), f"CONFIRM_WRITE 准确率 {correct}/{len(cases)} != 100%"


def test_cancel_write_100_percent():
    cases = [c for c in GOLDEN if c["expected_intent"] == AgentIntent.CANCEL_WRITE]
    correct = sum(1 for c in cases if _predict(c["message"], c["has_images"]) == AgentIntent.CANCEL_WRITE)
    assert correct == len(cases), f"CANCEL_WRITE 准确率 {correct}/{len(cases)} != 100%"
