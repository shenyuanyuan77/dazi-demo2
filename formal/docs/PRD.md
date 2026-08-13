# 搭子 · AI 健身教练 — 产品需求文档（PRD）

| 项 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 最后更新 | 2026-08-08 |
| 适用版本 | 小程序 v2.30.2+ |
| 撰写 | ZCode |
| 状态 | PRD 定稿；Node 侧已交付生产，Python 新一代 agent 处于 M1 骨架阶段 |

---

## 0. TL;DR — 一句话目标

> 做一个微信小程序「**AI 健身教练**」，用户用自然语言或拍照就能**记饮食、记训练、生成计划、分析身体数据、获得循证建议**；背后是一个**图编排（graph-orchestrated）+ RAG 增强 + 写入门禁**的 Agent，保证"该建议的建议、该写入的必先确认、越界的一律拒答"。

最终形态：一个**懂你身体数据和目标的、有长期记忆的、不会乱写数据的、回答带权威来源**的口袋教练。

---

## 1. 背景与问题

### 1.1 要解决的痛点

旧版「AI 教练」直接把用户消息透传给 LLM，由模型自由发挥，暴露出五类问题（来自 `fitness-coach-agent/README.md`）：

1. **意图错分**：训练计划被识别成饮食记录；用户补充说明被当成训练动作名。
2. **图片误判**：图片识别失败后仍然生成错误草稿。
3. **协议混乱**：模型用自然语言输出，前端靠猜决定渲染成哪种卡片，导致 proposal 类型错乱。
4. **写入无门禁**：模型可以直接宣称"已保存"，用户没确认就落库。
5. **知识无来源**：膳食/训练建议出自模型"想象"，无权威依据，无法运营更新。

### 1.2 为什么是 Agent，不是裸 LLM

裸 LLM 是"无状态、无约束、无记忆"的。用户场景需要：

- **状态**：跨轮记住 pendingWrite、训练计划、身体数据。
- **约束**：写入必须二段确认；越界话题必须拒答；安全信号必须升级提示。
- **知识**：膳食/活动/食物建议必须挂权威来源（膳食指南、食物成分表等）。
- **可运营**：知识可由运营通过 RAGFlow/数据文件更新，而不是改 prompt。

这些需求决定了它必须是一个**有图编排、有门禁、有 RAG、有记忆**的 Agent 系统。

---

## 2. 目标用户与场景

### 2.1 目标用户

- 18–45 岁，有健身/减脂/增肌诉求，但不请私教的普通用户。
- 习惯用微信，不习惯用复杂健身 App 记录的人群。
- 需要"低门槛记录 + 靠谱建议"，而不是专业训练分析。

### 2.2 核心场景（Agent 能力 → 意图枚举）

| 场景 | 典型输入 | Agent 意图 | 产出 |
|---|---|---|---|
| 拍照记一餐 | 拍食物图 + "记一下" | `DIET_RECORD` | `dietLog` proposal，待确认 |
| 文字记饮食 | "中午吃了鸡胸肉米饭" | `DIET_RECORD` | `dietLog` proposal |
| 饮食建议 | "减脂期蛋白质怎么吃" | `DIET_SUGGESTION` | 带 RAG 来源的文字建议 |
| 生成训练计划 | "安排一个练腿计划" | `TRAINING_PLAN_CREATE` | `workoutPlan` proposal |
| 改训练计划 | "深蹲改成 6 组" | `TRAINING_PLAN_UPDATE` | `workoutPlan` proposal |
| 记录训练完成 | "今天做了 4 组俯卧撑" | `TRAINING_RECORD` | `training_log` proposal |
| 身体数据分析 | 上传体脂秤截图 | `BODY_ANALYSIS` | `profilePatch` proposal + 趋势解读 |
| 确认写入 | "确认 / 保存" | `CONFIRM_WRITE` | 执行写工具落库 |
| 取消写入 | "算了 / 不要" | `CANCEL_WRITE` | 丢弃 pendingWrite |
| 越界拒答 | "写论文 / 股票 / 天气" | `UNSUPPORTED` | 统一拒答文案 |

### 2.3 非目标（明确不做）

- ❌ 不做医疗诊断、开药、伤病康复方案（只给一般安全建议 + 引导就医）。
- ❌ 不做社交、社区、排行榜。
- ❌ 不做付费课程/电商导流。
- ❌ 不做形象焦虑导向的"身材打分"。

---

## 3. 产品形态（最终效果）

### 3.1 前端：5 Tab + 1 AI 页面（iOS 27 设计语言）

| 页面 | 关键形态 |
|---|---|
| **首页** | 左信息/右环 layout；底部 3 列彩色数字（热量/蛋白/训练消耗）；sparkline 折线；AI 来源徽标 |
| **饮食** | 折叠餐食卡（早餐默认展开）；食物左滑删除；超标整卡 tinted（红）；AI 蓝色提示条 |
| **训练** | 中央 130rpx 进度环 + 3 列指标 + 折叠动作卡 + 液态玻璃 Rest Timer |
| **我的** | Profile 卡 + 4 列指标 Inset + 体重趋势 + Segmented 健身目标 + Inset List |
| **AI 教练** | iOS 化顶栏（72rpx 圆形按钮）+ 圆角 28 消息气泡 + spring 入场动画；支持文本/最多 3 张图片输入 |

### 3.2 AI 教练交互范式（核心）

这是整个产品的"灵魂交互"，区别于普通聊天：

```
用户说话/拍照
    ↓
Agent 识别意图 + 槽位
    ↓
返回 Answer（含 proposal 卡片 + 中文解释）
    ↓
用户【确认 / 修改 / 取消】          ← 二段确认门禁，关键安全设计
    ↓
（确认）→ 执行写工具落库 → 回"已保存"
（修改）→ 重新生成 proposal
（取消）→ 丢弃
```

**铁律**：模型在 runtime 未确认写入成功前，**绝不能说"已保存"**（`enforce_answer_contract` 会自动洗掉这类越权宣称）。

### 3.3 用户感知到的"智能"特征

最终用户会感觉到这个 AI 教练：

1. **懂我**：记得我的体重、目标、最近饮食和训练（长期记忆）。
2. **不乱写**：任何记录都先给我一张可核对卡片，我点确认才落库。
3. **靠谱**：建议带《膳食指南》《食物成分表》来源，不是瞎编。
4. **有边界**：问它股票/写论文/天气，它礼貌拒绝并提示能做什么。
5. **不贩卖焦虑**：不谈"理想身材"，聚焦功能、能量、可持续习惯。

---

## 4. 技术栈

### 4.1 总览

```
微信小程序前端 (WXML/WXSS/JS, iOS 27 设计)
    │  ai/send
    ▼
微信云函数 mcloud (腾讯云, Node) — 瘦身层: 鉴权 / 图片转 HTTPS / 转发 / 落库
    │  HTTPS
    ▼
agent-service (Python 3.10+ / FastAPI / LangGraph) — Agent 大脑
    │  HTTP
    ▼
RAGFlow (可运营权威知识库) + MiMo LLM (OpenAI 兼容)
```

### 4.2 分层职责与技术选型

| 层 | 技术 | 职责 | 现状 |
|---|---|---|---|
| **前端** | 微信小程序原生 + iOS 27 WXSS | 5 Tab 渲染、聊天 UI、proposal 卡片、二段确认交互 | ✅ 已交付 |
| **云函数 mcloud** | 腾讯云 SCF / Node | 鉴权、微信云存储图片转 HTTPS、转发到 agent-service、落库 | 🟡 当前直连 MiMo，待切到 Python agent |
| **agent-service** | Python 3.10+ / FastAPI / **LangGraph** (StateGraph) / LangChain | 意图路由、子 agent 编排、记忆、门禁、prompt 拼装、调 LLM | 🟡 M1 骨架完成，M2+ 待补 |
| **LLM Provider** | 小米 **MiMo**（OpenAI 兼容），`mimo-v2.5`(多模态) / `mimo-v2-flash`(轻量) | 意图识别 / 槽位提取 / proposal 生成 / 建议生成 | ✅ provider 工厂已就绪 |
| **知识检索 RAG** | 默认本地 **TF-IDF**（离线零依赖）；可切 **RAGFlow**（生产） | 膳食指南/食物成分表/身体活动指南/FAQ 的权威召回 | ✅ Node 侧已实现 50+ chunk；Python 侧待镜像 |
| **存储** | 微信云数据库（`AI_LOG` / `AI_PROFILE` / `AI_MESSAGE`） | 饮食/训练/身体记录 + 用户画像 | ✅ 已有 |
| **可观测** | structlog + trace（每轮回 `trace` 数组） | 调试 + 评测门禁 | 🟡 Python 侧待接 |
| **评测** | pytest (Python) / operational_gate.js (Node) | 结构化回归 + QA-pairs + 上线门禁 | 🟡 Python 58 tests；Node 有完整门禁 |
| **CI** | GitHub Actions | Node harness 门禁自动跑 | ✅ Node 有；Python 待加 |

### 4.3 为什么选 LangGraph（而不是裸 LangChain）

- **图编排**：意图路由 → 上下文选择 → 检索 → 子 agent → 生成 → 门禁 → 落库，是**有状态的多步流程**，StateGraph 天然契合。
- **条件边**：意图决定路径（short_circuit vs call_model），用 `add_conditional_edges` 表达清晰。
- **可观测**：每个节点天然产 trace，对应原 Node harness 的 stage trace。
- **可测**：图可 `.ainvoke`，单测/端到端测友好。

### 4.4 为什么选 MiMo + RAGFlow

- **MiMo**：OpenAI 兼容，1 行 `base_url` 可切到 DeepSeek/Qwen/OpenAI；`v2.5` 多模态（图片必走它），`flash` 便宜（纯文本轻量任务）。
- **RAGFlow**：开源可自建，支持中文向量（bge-large-zh），知识库可由运营在控制台维护，不必改代码。

### 4.5 模型路由策略（确定性）

```
有图片            → mimo-v2.5    (多模态必走)
纯文本建议/计划   → mimo-v2.5    (proposal 生成，temperature 0.25)
意图路由/槽位提取 → mimo-v2-flash (廉价，temperature 低)
schema 修补       → mimo-v2-flash 或本地 validator
```

---

## 5. Agent 架构（核心）

### 5.1 LangGraph 主图（目标态）

```
START
  │
  ▼
[intent_router]  ── 规则兜底（确认/取消/越界）──► [finalize] (short_circuit)
  │ (规则无把握 → LLM router)
  ▼
[context_selector]  选择 profile / history / recent_logs / memory 注入
  │
  ▼
[retriever]  RAG 召回权威知识（仅 deep 意图）
  │
  ▼
[subagent_xxx]  按意图分发：
  │            diet_agent / training_agent / body_agent / profile_agent / fallback_agent
  ▼
[llm_generate]  拼装 prompt + RAG context → 调 MiMo → 解析结构化 proposal
  │
  ▼
[guardrails]  越界拒答 / 早写宣称清洗 / 缺确认提示补全
  │
  ▼
[answer_contract]  enforceAnswerContract — 出网关前最终安全清洗
  │
  ▼
[finalize]  → build_answer → END
```

### 5.2 数据契约（绝不漂移）

模型/Agent 必须输出严格 JSON（**禁止 Markdown 包裹**），最外层：

```json
{
  "type": "diet | training | general",
  "title": "移动端短标题",
  "content": "给用户看的中文回复",
  "payload": {
    "intent": { "intent": "...", "domain": "diet|training|body|general", "responseMode": "answer_only|generate_proposal|modify_proposal|clarify" },
    "proposals": [],
    "agentState": { "currentTask": {}, "pendingWrite": {}, "validationResult": {} },
    "answerContract": { "passed": true, "violations": [] }
  },
  "memory": { "profilePatch": {}, "bodyStats": {}, "exerciseLog": {}, "dietLog": {}, "observation": "" },
  "safety": { "level": "none|caution|urgent", "message": "" }
}
```

**proposal 类型只能是 3 种**：`dietLog` / `workoutPlan` / `profilePatch`。前端只渲染 proposal，不解析自然语言。

### 5.3 pendingWrite 二段确认协议（关键安全设计）

```
Agent 生成 pendingWrite (status=waiting_confirm, TTL=30min)
   → 前端渲染确认卡片
   → 用户 CONFIRM_WRITE / CANCEL_WRITE
   → (确认) 执行写工具: diet.log.create / training.log.create / training.plan.create / body.metric.create / user.profile.update
   → 落库 → status=confirmed
```

迁移铁律（来自 README）：**写入门禁 / answer 协议向后兼容 / 评测门禁只升不降**——三条底线在 Python 重构中绝不允许退化。

### 5.4 权威知识数据白名单

所有 RAG chunk 必须来自已发表权威文献，每条带 `source + sourceUrl`：

- 《中国居民膳食指南（2022）》— chinanutri.cn
- 《中国成人身体活动指南（2021）》
- 《中国食物成分表（第 6 版）》
- 中国营养学会综合建议

回答中模型**必须**按规则标注来源。禁止自创数值。

### 5.5 安全边界（Agent 拒答/升级规则）

- ❌ 不推荐极端节食、不鼓励带伤训练。
- ❌ 不诊断疾病、不开药、不建议治疗性补剂。
- ⚠️ 出现胸痛、昏厥、严重呼吸困难、突发无力 → 建议停止运动 + 联系急救/医生（`safety.level = urgent`）。
- ❌ 不制造/强化身材焦虑，不拿体重评价个人价值。
- 🚫 越界话题（论文/代码/股票/天气/星座/旅游/翻译/合同）→ 统一 `UNSUPPORTED` 文案，列出仅支持的能力。

---

## 6. 人格与语气（SOUL）

> 专业、鼓励、克制、可靠。像一个重视"一致性、技术、恢复、长期健康"而非短期强度的教练。

**Good**：
> 本周完成了两次训练，稳定性比追求满额更重要。下周先保持频率，再考虑增加训练量。

**Avoid**：
> 必须自律，否则永远练不出好身材。

原则：给理由 + 承认不确定性；表扬努力而非外表；不审判"吃多了/练少了"；把大目标拆成可执行小动作。

---

## 7. 评测与上线门禁（只升不降）

| 维度 | 工具 | 门槛 |
|---|---|---|
| 结构化回归 | `eval/runner.js` (Node) / `pytest` (Python) | ≥25 turn 全绿 |
| QA-pairs | `eval/qa_runner.js` | ≥75 条，覆盖饮食/训练/身体/确认/越界拒答 |
| 越界拒答 | QA 子集 | ≥20 条 |
| 适配器合约 | `adapter_contract.test.js` | 模型原文不能绕过 pendingWrite/拒答/未确认写入 |
| 语法检查 | harness JS + 云函数接入点 | 通过 |

迁移后 Python 侧必须复刻同等门禁（pytest 已有 58 项，需补 eval/QA 等价集）。

---

## 8. 里程碑与路线图（M1–M6）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M1** | Python 骨架：FastAPI + StateGraph + types 1:1 + answer 协议合同 + 规则兜底意图 | ✅ 完成 |
| **M2** | LLM router 主路径 + `completer` 接 MiMo + 子 agent（diet/training/body/profile/fallback） | ⏳ 未开始（**当前阻塞点**） |
| **M3** | RAGFlow 接入 + retrieval 节点 + memory（episodic/procedural/shortTerm/profile）+ guardrails | ⏳ 未开始 |
| **M4** | prompt_builder + slot_parser + context_selector + state_store/checkpoint | ⏳ 未开始 |
| **M5** | 评测体系镜像（pytest eval/QA 等价 + operational gate）+ CI | ⏳ 未开始 |
| **M6** | 云函数切流到 agent-service + 灰度（A/B local-TFIDF vs RAGFlow）+ 生产上线 | ⏳ 未开始 |

> 注：Node 侧（mcloud + harness）当前已独立承担生产流量，Python agent 完成前作为**双轨**共存，互不影响。

---

## 9. 当前完成度（截至 2026-08-08）

| 线 | 完成度 | 说明 |
|---|---|---|
| **Node 生产线** | ~95% | 已接 MiMo、有 RAG、有门禁、灰度可用 |
| **Python 新 agent** | ~28% | M1 骨架完成，58 tests 全过；M2–M6 待补 |

**生产上线阻塞单点**：`completer` 节点未接 LLM（provider 工厂已就绪，只差在图里调用 + prompt 拼装）。这是把 M1 推进到"能真正回答问题"的最小关键路径。

---

## 10. 待决策事项

1. **RAGFlow 自建 vs 用云厂商向量服务**——影响 M3 成本与运维。
2. **Python agent 是否需要 checkpoint 持久化**（LangGraph `MemorySaver` vs Postgres checkpointer）——影响多实例部署。
3. **灰度比例**——切流时 local-TFIDF / RAGFlow / Node 旧链路三者的分流策略。
4. **多模态预算**——`mimo-v2.5` 图片调用成本上限与限流策略。

---

**附**：本文档基于 `agent-service/`、`cloudfunctions/mcloud/fitness-agent-harness/`、`fitness-coach-agent/`、`docs/RAG_AND_OFFICIAL_DATA_DELIVERY.md` 现状综合撰写。
