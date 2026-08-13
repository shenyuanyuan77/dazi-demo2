"""
load_test.py — Locust 压测脚本 (验收 §20/§21).

用法:
    pip install locust
    locust -f load_test.py --host http://<agent-service-ip>:8787

然后浏览器开 http://localhost:8089 配置并发用户数.

验收 §20 要求覆盖:
    - 0.5× 峰值 (长期稳定)
    - 1× 峰值 (SLA 全达标)
    - 2× 峰值 (不崩溃, 允许延迟增加)
    - 突发流量 (10-30s 涌入)
"""
from locust import HttpUser, between, task


class AgentServiceUser(HttpUser):
    """模拟真实小程序用户发 AI 消息."""

    wait_time = between(2, 8)  # 用户思考间隔 2-8s

    def on_start(self):
        self.user_id = f"loadtest-{self.environment.runner.user_count if self.environment.runner else 0}"

    @task(40)
    def diet_record(self):
        """40% 流量: 饮食记录 (最常见)."""
        self.client.post(
            "/agent/turn",
            json={
                "userId": self.user_id,
                "message": "午餐吃了鸡胸肉和米饭",
            },
            name="DIET_RECORD",
        )

    @task(20)
    def diet_suggestion(self):
        """20%: 饮食建议."""
        self.client.post(
            "/agent/turn",
            json={
                "userId": self.user_id,
                "message": "减脂期蛋白质怎么吃",
            },
            name="DIET_SUGGESTION",
        )

    @task(15)
    def training_plan(self):
        """15%: 训练计划."""
        self.client.post(
            "/agent/turn",
            json={
                "userId": self.user_id,
                "message": "安排一个增肌训练计划每周练4天",
            },
            name="TRAINING_PLAN",
        )

    @task(10)
    def body_analysis(self):
        """10%: 身体数据."""
        self.client.post(
            "/agent/turn",
            json={
                "userId": self.user_id,
                "message": "我体重70kg 体脂18%",
            },
            name="BODY_ANALYSIS",
        )

    @task(10)
    def unsupported(self):
        """10%: 越界拒答 (验证 UNSUPPORTED 响应快)."""
        self.client.post(
            "/agent/turn",
            json={
                "userId": self.user_id,
                "message": "帮我写论文",
            },
            name="UNSUPPORTED",
        )

    @task(5)
    def confirm_flow(self):
        """5%: 多轮确认 (带 previous_state)."""
        self.client.post(
            "/agent/turn",
            json={
                "userId": self.user_id,
                "message": "确认",
                "previousState": {
                    "pendingWrite": {
                        "id": "loadtest-pw",
                        "type": "diet_log",
                        "status": "waiting_confirm",
                        "data": {"items": [{"name": "鸡胸肉"}]},
                        "summaryForUser": "饮食记录",
                    }
                },
            },
            name="CONFIRM",
        )


# ---------- 验收门槛 (在 locust 报告里对照) ----------
"""
验收 §16-19 性能门槛:

普通 API:
    P50 ≤ 300ms, P95 ≤ 1s, P99 ≤ 2s, 成功率 ≥ 99.9%

AI 文本:
    首响应 P50 ≤ 3s, P95 ≤ 8s
    完整响应 P50 ≤ 8s, P95 ≤ 20s
    超时上限 ≤ 30s, 成功率 ≥ 99%

AI 图片 (本脚本不测, 需带 image):
    P95 ≤ 15s, 完整 ≤ 30s, 成功率 ≥ 98.5%

Soak Test (§21):
    locust -f load_test.py --host ... --run-time 24h --users 50
    观察: 内存泄漏 / DB 连接 / 错误率 / 延迟漂移
"""
