# Agent Service — 新一代健身教练 Agent

基于 **LangGraph + RAGFlow** 的图编排 (graph-orchestrated) agent 服务，替代原 Node 侧规则 harness。

> 迁移目标：在「不削弱写入门禁 / answer 协议向后兼容 / 评测门禁只升不降」三条底线之上，把意图识别从纯正则升级为 LLM 路由 + 规则兜底，并把硬编码领域知识替换为可运营的 RAGFlow 知识库。

## 架构位置

```
小程序前端 (不变)
    │ ai/send
    ▼
微信云函数 mcloud (瘦身: 鉴权 / 图片转 HTTPS / 转发 / 落库)
    │ HTTPS
    ▼
agent-service (本目录, Python + LangGraph)
    │ HTTP
    ▼
RAGFlow (专业知识库: 膳食指南 / 食物库 / 动作库 / FAQ)
```

## 与原 Node harness 的对应关系

| 原 Node 模块 | 新 Python 模块 |
|---|---|
| `shared/types/agent_types.js` | `app/types/agent_types.py` (1:1 枚举) |
| `runtime/tools/tool_schemas.js` | `app/tools/tool_schemas.py` + `tool_registry.py` |
| `runtime/parser/intent_parser.js` | `app/nodes/intent_router.py` (LLM 主路径 + 规则兜底) |
| `runtime/guardrails/guardrails.js` | `app/guardrails/` |
| `runtime/context/context_policy.js` | `app/nodes/context_selector.py` |
| `runtime/orchestrator/agent_orchestrator.js` | `app/graph/fitness_graph.py` (StateGraph) |
| `runtime/.../subagents/*_agent.js` | `app/nodes/subagent_*.py` |
| `runtime/memory/*` | `app/memory/` |
| `project/dazi/service/ai_agent_adapter.js` (MiMo HTTP) | `app/llm/provider.py` (LangChain ChatOpenAI) |
| `project/dazi/agent/fitness_coach_skill.js` (硬编码知识) | RAGFlow 知识库 (可运营) + `app/retrieval/ragflow_client.py` |

## 快速开始

```bash
cd agent-service

# 安装依赖 (推荐用 venv 或 uv)
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写 MIMO_API_KEY 等

# 起服务
python -m app.main
# 或者
uvicorn app.main:app --reload --port 8787

# 跑测试
pytest
```

## 环境变量

见 `.env.example`。所有 LLM/RAG 密钥只走环境变量，不入仓。

## 进度

参考上级目录 `docs/AGENT_MIGRATION_PLAN.md` 跟踪 M1–M6 里程碑。
