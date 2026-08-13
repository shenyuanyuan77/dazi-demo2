# M6 生产部署运维手册

> 验收 §39 (Production Ready) 配套文档。覆盖灰度切流、回滚、监控、压测。

| 项 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 适用 | agent-service (Python) + mcloud (Node) 双轨切流 |
| 前置条件 | M1-M5 全部 PASS (621 tests + operational gate 绿) |

---

## 1. 架构 (双轨期)

```
小程序前端
    │ ai/send
    ▼
mcloud 云函数 (Node)
    │ ┌─ AGENT_USE_PYTHON=off  → Node harness + MiMo (旧, 稳定)
    │ ├─ AGENT_USE_PYTHON=gray → 按 userId 哈希灰度分流
    │ └─ AGENT_USE_PYTHON=on   → 全量 Python agent-service
    ▼
agent-service (Python, :8787)  ←─── 失败自动回退 Node (零中断)
    │
    ├─ MiMo LLM
    └─ RAGFlow (可选, 未配则 local TF-IDF)
```

---

## 2. 环境变量 (mcloud 云函数)

| 变量 | 说明 | 示例 |
|---|---|---|
| `AGENT_USE_PYTHON` | 切流开关: `off` / `gray` / `on` | `gray` |
| `AGENT_GRAY_PERCENT` | 灰度百分比 (仅 gray 模式) | `5` |
| `AGENT_SERVICE_URL` | Python agent-service 地址 | `http://内网IP:8787` |
| `AGENT_INTERNAL_TOKEN` | 内部鉴权 token (与 Python 侧一致) | `随机串` |
| `AGENT_SERVICE_TIMEOUT` | 转发超时 (ms) | `30000` |

**回滚**: 把 `AGENT_USE_PYTHON` 改回 `off`, 重新部署云函数。**无需改 Python 服务**。

---

## 3. 灰度发布流程 (验收 §32)

```
内部环境 (AGENT_USE_PYTHON=on, 内测)
    ↓ 验证 24h, 指标无退化
1%   (gray, GRAY_PERCENT=1)
    ↓ 观察 Error Rate / P95 / Proposal Error
5%   (GRAY_PERCENT=5)
    ↓
20%  (GRAY_PERCENT=20)
    ↓
50%  (GRAY_PERCENT=50)
    ↓
100% (on)
```

**每级观察指标** (从 agent-service `/metrics` 拉取):

| 指标 | 告警阈值 |
|---|---|
| `errors_total / turns_total` | > 2% |
| `avg_turn_latency_ms` | > 8000 (文本) / 15000 (图片) |
| `intent_distribution` 异常偏移 | UNSUPPORTED 占比突增 |
| 云函数 `agentDriver=python` 错误日志 | 回退 Node 次数 > 1% |

**核心指标恶化 → 停止扩大流量, 回滚。**

---

## 4. 回滚 (验收 §33)

回滚 = 关闭 Python, 切回 Node。**必须实测, 不能只确认 flag**。

### 4.1 操作步骤

1. mcloud 环境变量: `AGENT_USE_PYTHON=off`
2. 重新部署 mcloud
3. 验证:
   - 新请求 `answer.payload.agentDriver` 不再是 `python`
   - pendingWrite 状态连续 (Python 产出的 waiting_confirm 仍可被 Node 处理)
   - session 历史可读
   - 正在处理的请求完成 (不中断)

### 4.2 回滚测试用例

```
1. Python 生成 pendingWrite (waiting_confirm)
2. 切流回 Node
3. 用户发"确认"
4. Node 应能识别 CONFIRM_WRITE 并执行写入
   (pendingWrite 协议两端一致, 见 miniprogram_adapter.py)
```

---

## 5. 监控 (验收 §31)

### 5.1 agent-service `/metrics` 端点

```bash
curl http://agent-service:8787/metrics
# {
#   "turns_total": 1234,
#   "errors_total": 3,
#   "intent_distribution": {"DIET_RECORD": 300, "UNSUPPORTED": 50, ...},
#   "avg_turn_latency_ms": 3200.5,
#   "llm_configured": true,
#   "ragflow_configured": false
# }
```

### 5.2 必建 Dashboard

| 面板 | 数据源 |
|---|---|
| QPS / Error Rate | `/metrics` turns_total / errors_total |
| Intent 分布 | `/metrics` intent_distribution |
| 平均延迟 | `/metrics` avg_turn_latency_ms |
| LLM 可用性 | llm_configured + MiMo 探活 |
| RAG 可用性 | ragflow_configured + `/health` |
| 节点耗时 | answer.payload.agentTrace (每节点 latency) |

### 5.3 告警规则

- `errors_total` 增速 > 10/min → PagerDuty
- `avg_turn_latency_ms > 15000` 持续 5min → 告警
- `llm_configured = false` → 立即告警 (API Key 失效)

---

## 6. 部署 agent-service (Python)

### 6.1 安装

```bash
cd agent-service
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

cp .env.example .env
# 编辑 .env: MIMO_API_KEY / AGENT_INTERNAL_TOKEN
```

### 6.2 启动

```bash
# 开发
python -m app.main

# 生产 (uvicorn + workers)
uvicorn app.main:app --host 0.0.0.0 --port 8787 --workers 4
```

### 6.3 进程管理 (推荐 systemd / supervisor)

```ini
# /etc/systemd/system/agent-service.service
[Unit]
Description=Fitness Agent Service
After=network.target

[Service]
WorkingDirectory=/opt/agent-service
ExecStart=/opt/agent-service/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787 --workers 4
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

---

## 7. 性能验收门槛 (验收 §16-19)

| 指标 | 门槛 |
|---|---|
| 文本首个有效响应 P95 | ≤8s |
| 图片首个有效响应 P95 | ≤15s |
| 普通 API P95 | ≤1.5s |
| AI 请求成功率 | ≥99% |
| 超时上限 | ≤30s |

压测脚本 (M6 人工执行):
```bash
# 1× 峰值负载
locust -f load_test.py --users 100 --spawn-rate 10 --run-time 30m
# 2× 峰值
locust -f load_test.py --users 200 --spawn-rate 10 --run-time 10m
```

---

## 8. 上线 Go/No-Go Checklist (验收 §41)

### 功能
- [x] 首页全流程通过
- [x] 饮食全流程通过 (pendingWrite 二段确认)
- [x] 训练全流程通过
- [x] 身体数据全流程通过
- [x] AI 教练全流程通过
- [x] 图片输入 (≤3 图) 通过
- [x] 多轮对话通过
- [x] Memory 通过
- [x] RAG + 来源标注通过
- [x] Proposal Contract 通过
- [x] pendingWrite 100% 通过
- [ ] 重复请求测试 (需压测环境)
- [ ] 数据一致性 (需生产 DB)
- [ ] Node/Python 切流实测 (需部署)

### 测试
- [x] Unit Test 全绿 (621 passed)
- [x] Integration Test 全绿
- [x] Golden Set 达标 (303 条)
- [x] operational_gate PASS
- [ ] E2E 真实链路 (需 mcloud + agent-service 联调)
- [ ] 真机测试 (需 iOS/Android 设备)
- [ ] 弱网测试 (需真机)
- [ ] 回归测试 (需基线对比)

### 性能
- [ ] 冷启动达标 (需真机)
- [ ] API P95 达标 (需压测)
- [ ] AI 文本 P95 达标 (需压测)
- [ ] AI 图片 P95 达标 (需压测)
- [ ] 1× 峰值压测达标 (需压测)
- [ ] 2× 峰值无雪崩 (需压测)
- [ ] Soak Test 无泄漏 (需 8-24h 运行)

### 生产
- [x] /metrics 监控端点
- [x] /health 健康检查
- [x] Agent trace (每节点)
- [ ] 灰度测试 (需部署, 代码已就绪)
- [ ] 回滚测试 (需部署, 代码已就绪)

> **P0/P1 全部完成 + 人工验收项通过后 → GO 上线。**

---

## 9. 代码侧已就绪 vs 需人工执行

| 项 | 状态 | 说明 |
|---|---|---|
| agent-service 全部代码 | ✅ | M1-M5 完成, 621 tests |
| 云函数切流逻辑 | ✅ | agent_service_client.js + sendMessage 灰度 |
| 灰度路由 (off/gray/on) | ✅ | shouldUsePythonAgent |
| 回滚机制 | ✅ | 改 env 即可, 自动降级 |
| /metrics 监控端点 | ✅ | turns/errors/intent/latency |
| /health 健康检查 | ✅ | llm/ragflow 状态 |
| CI workflow | ✅ | agent-service-gate.yml |
| operational_gate | ✅ | PASS (621 tests) |
| 实际部署 agent-service | ⏳ | 需服务器 + systemd |
| mcloud 配 env + 部署 | ⏳ | 需腾讯云控制台 |
| 灰度实测 | ⏳ | 需部署后执行 |
| 回滚实测 | ⏳ | 需部署后执行 |
| 真机/弱网/压测 | ⏳ | 需设备 + 压测环境 |
| 生产监控 Dashboard | ⏳ | 需接入 Prometheus/Grafana |
