"""Operational Gate — 上线门禁脚本.

验收 §38 要求: P0/P1 tests 100% 通过.
本脚本聚合跑全量 pytest 并断言门槛, 供 CI 调用.

用法:
    python -m tests.operational_gate
    # 或
    pytest tests/operational_gate.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


# 上线门槛 (验收 §1, §38)
MIN_TOTAL_TESTS = 300          # §24 测试规模
MIN_UNIT_TESTS = 150           # §24 L1 Unit
MIN_GOLDEN_INTENT = 300        # §7.1 Intent golden
REQUIRED_PASS_RATE = 1.0       # P0/P1 100%
FORBIDDEN_FAILURES = 0         # 任何失败都阻断


def _run_pytest_collect() -> tuple[int, int]:
    """跑 pytest --collect-only 拿到测试总数 (不执行)."""
    root = Path(__file__).resolve().parent.parent
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", str(root)],
        capture_output=True, text=True, cwd=str(root),
    )
    out = result.stdout
    # 抓 "N tests collected"
    import re
    m = re.search(r"(\d+) tests collected", out)
    total = int(m.group(1)) if m else 0
    # unit tests = tests/unit/ 下的
    m2 = re.search(r"tests/unit.*?(\d+) tests", out) or re.findall(r"tests/unit/\w+\.py", out)
    unit_count = len(m2) if isinstance(m2, list) else 0
    return total, unit_count


def _run_pytest_full() -> tuple[int, int]:
    """跑全量 pytest, 返回 (passed, failed)."""
    root = Path(__file__).resolve().parent.parent
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "--tb=no", str(root)],
        capture_output=True, text=True, cwd=str(root),
    )
    out = result.stdout
    import re
    m_pass = re.search(r"(\d+) passed", out)
    m_fail = re.search(r"(\d+) failed", out)
    passed = int(m_pass.group(1)) if m_pass else 0
    failed = int(m_fail.group(1)) if m_fail else 0
    return passed, failed


def gate() -> int:
    """执行上线门禁, 返回 exit code (0=PASS, 1=FAIL)."""
    print("=" * 60)
    print("  Operational Gate — 上线门禁检查")
    print("=" * 60)

    failures: list[str] = []

    # 1. 跑全量测试
    passed, failed = _run_pytest_full()
    total = passed + failed
    print(f"[1/4] 全量测试: {passed} passed / {failed} failed / {total} total")

    if failed > FORBIDDEN_FAILURES:
        failures.append(f"测试失败 {failed} 条 (门槛: 0)")
    if total < MIN_TOTAL_TESTS:
        failures.append(f"测试总数 {total} < {MIN_TOTAL_TESTS}")

    # 2. Golden Set 数量
    try:
        from tests.golden.golden_intent_dataset import build_golden_dataset
        golden = build_golden_dataset()
        print(f"[2/4] Intent Golden Set: {len(golden)} 条 (门槛 ≥{MIN_GOLDEN_INTENT})")
        if len(golden) < MIN_GOLDEN_INTENT:
            failures.append(f"Golden Set {len(golden)} < {MIN_GOLDEN_INTENT}")
    except Exception as e:  # noqa: BLE001
        failures.append(f"Golden Set 加载失败: {e}")

    # 3. 关键模块可导入
    try:
        from app.graph import build_fitness_graph  # noqa: F401
        from app.guardrails import input_guardrail  # noqa: F401
        from app.memory import classify_memory_update  # noqa: F401
        from app.retrieval import build_rag_context  # noqa: F401
        print("[3/4] 关键模块导入: OK (graph/guardrails/memory/retrieval)")
    except Exception as e:  # noqa: BLE001
        failures.append(f"关键模块导入失败: {e}")

    # 4. 图可编译
    try:
        from app.graph import build_fitness_graph
        g = build_fitness_graph()
        assert g is not None
        print("[4/4] LangGraph 编译: OK")
    except Exception as e:  # noqa: BLE001
        failures.append(f"图编译失败: {e}")

    print("=" * 60)
    if failures:
        print("  RESULT: FAIL")
        for f in failures:
            print(f"    - {f}")
        return 1
    print(f"  RESULT: PASS  ({passed} tests, ≥{MIN_TOTAL_TESTS} required)")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(gate())
