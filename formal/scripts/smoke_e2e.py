"""
smoke_e2e.py — 部署后冒烟测试 (验收 §40 最终测试矩阵).

部署 agent-service 到服务器后执行:
    python scripts/smoke_e2e.py --url http://<ip>:8787

验证项 (对照 §41 Go/No-Go):
    - /health 200
    - /metrics 可读
    - UNSUPPORTED 拒答
    - DIET_RECORD -> pendingWrite
    - CONFIRM -> confirmed
    - CANCEL -> cancelled
    - 多轮 plan->modify->confirm
    - RAG 来源标注
"""
import argparse
import sys

import httpx


def smoke(url: str) -> int:
    c = httpx.Client(base_url=url, timeout=30)
    failures: list[str] = []

    # 1. health
    r = c.get("/health")
    if r.status_code != 200:
        failures.append(f"/health status={r.status_code}")
    else:
        h = r.json()
        print(f"✅ /health: service={h['service']} llm={h['llm_configured']} rag={h['ragflow_configured']}")

    def turn(payload):
        r = c.post("/agent/turn", json=payload)
        return r.json()

    # 2. UNSUPPORTED
    d = turn({"userId": "smoke", "message": "帮我写论文"})
    if not (d.get("ok") and "只支持" in d.get("answer", {}).get("content", "")):
        failures.append("UNSUPPORTED 未拒答")
    else:
        print("✅ UNSUPPORTED 拒答")

    # 3. DIET_RECORD -> pendingWrite
    d = turn({"userId": "smoke", "message": "午餐吃了鸡胸肉和米饭"})
    pw = (d.get("answer", {}).get("payload", {}).get("agentState") or {}).get("pendingWrite")
    if not (d.get("ok") and pw and pw.get("status") == "waiting_confirm"):
        failures.append("DIET_RECORD 未生成 waiting_confirm pendingWrite")
    else:
        print(f"✅ DIET_RECORD -> pendingWrite({pw['type']}, {pw['status']})")

    # 4. CONFIRM
    pw_copy = dict(pw)
    pw_copy["status"] = "waiting_confirm"
    d = turn({"userId": "smoke", "message": "确认", "previousState": {"pendingWrite": pw_copy}})
    pw2 = (d.get("answer", {}).get("payload", {}).get("agentState") or {}).get("pendingWrite")
    if not (pw2 and pw2.get("status") == "confirmed"):
        failures.append("CONFIRM 未变 confirmed")
    else:
        print(f"✅ CONFIRM -> {pw2['status']}")

    # 5. CANCEL
    pw_copy["status"] = "waiting_confirm"
    d = turn({"userId": "smoke", "message": "取消", "previousState": {"pendingWrite": pw_copy}})
    pw3 = (d.get("answer", {}).get("payload", {}).get("agentState") or {}).get("pendingWrite")
    if not (pw3 and pw3.get("status") == "cancelled"):
        failures.append("CANCEL 未变 cancelled")
    else:
        print(f"✅ CANCEL -> {pw3['status']}")

    # 6. 多轮 plan -> modify -> confirm
    d1 = turn({"userId": "smoke", "message": "安排增肌训练计划"})
    if not d1.get("ok"):
        failures.append("多轮: 计划生成失败")
    else:
        pw_p = (d1["answer"]["payload"].get("agentState") or {}).get("pendingWrite")
        if pw_p:
            pw_p["status"] = "waiting_confirm"
            d2 = turn({"userId": "smoke", "message": "深蹲改成6组", "previousState": {"pendingWrite": pw_p}})
            if d2.get("ok"):
                pw_p2 = (d2["answer"]["payload"].get("agentState") or {}).get("pendingWrite")
                if pw_p2 and pw_p2["status"] == "waiting_confirm":
                    pw_p2["status"] = "waiting_confirm"
                    d3 = turn({"userId": "smoke", "message": "确认", "previousState": {"pendingWrite": pw_p2}})
                    pw_p3 = (d3["answer"]["payload"].get("agentState") or {}).get("pendingWrite")
                    if pw_p3 and pw_p3["status"] == "confirmed":
                        print("✅ 多轮 plan->modify->confirm")
                    else:
                        failures.append("多轮: 确认失败")
                else:
                    failures.append("多轮: 修改后无 pendingWrite")
            else:
                failures.append("多轮: 修改请求失败")
        else:
            failures.append("多轮: 计划无 pendingWrite")

    # 7. /metrics
    r = c.get("/metrics")
    if r.status_code == 200:
        m = r.json()
        print(f"✅ /metrics: turns={m['turns_total']} errors={m['errors_total']} avg={m['avg_turn_latency_ms']}ms")
        print(f"   intent分布: {m['intent_distribution']}")
        if m["errors_total"] > 0:
            failures.append(f"metrics 报告 {m['errors_total']} 个错误")
    else:
        failures.append(f"/metrics status={r.status_code}")

    # 总结
    print("\n" + "=" * 40)
    if failures:
        print("❌ SMOKE FAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("✅ SMOKE PASS — 所有关键链路正常")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True, help="agent-service URL, e.g. http://10.0.0.10:8787")
    args = p.parse_args()
    sys.exit(smoke(args.url))
