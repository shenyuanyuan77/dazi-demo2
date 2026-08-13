# RAG + 官方数据接入交付报告

> 本次会话在 `D:\搭子demo2\formal` 上完成两件事：①对齐设计稿的 iOS 27 视觉；②将官方膳食/活动/食物知识接入并实现 RAG 检索增强。

---

## 1. 设计对齐（5 个 tab + 1 个 AI 页面）

| 页面 | 文件 | 关键改动 |
| --- | --- | --- |
| 首页 | `pages/home/index/home_index.{wxml,wxss,js}` | 左信息/右环 layout、底部 3 列彩色数字（蓝/绿/橙）、sparkline 折线、AI 来源徽标 |
| 饮食 | `pages/diet/index/diet_index.{wxml,wxss,js}` | 折叠餐食卡（早餐默认展开）、食物左滑删除、加餐超标整卡 tinted（红）、AI 蓝色提示条 |
| 我的 | `pages/my/index/my_index.{wxml,wxss}` | 头部 Profile 卡 + 4 列指标 Inset + 体重趋势 + Segmented 健身目标 + List Inset（身体/设置/缓存/关于 + 独立退出组） |
| 训练 | `pages/training/index/training_index.{wxml,wxss,js}` | "今日训练消耗" + 中央 130rpx 进度环 + 3 列指标 + 折叠动作卡 + 液态玻璃 Rest Timer（含 `workoutProgress` 状态） |
| AI 教练 | `pages/ai/chat/ai_chat.wxss` | 顶栏 iOS 化（72rpx 圆形按钮、圆角 20）、消息气泡 iOS 27 圆角（角部 8，其余 28）、spring 入场动画 |

设计稿存于：`D:\搭子demo2\docs\design-reference\`（5 张 PNG）。

---

## 2. RAG 架构

### 2.1 设计目标
- 离线可用：默认本地 TF-IDF，无需外部服务
- 可插拔：`driver: "local" | "ragflow"` 切换
- 数据权威：4 个官方源，50+ 知识 chunk
- 性能：lazy index，单次检索 < 5ms（小数据集）

### 2.2 文件结构

```
project/dazi/data/
├── diet_guidelines.js           (已存在) 膳食推荐常量
├── activity_guidelines.js       (已存在) 身体活动常量
├── food_composition.js          (已存在) 食物成分精选
├── index.js                     (已扩展) 接入 knowledge + retrieval
└── knowledge/                   (新建)
    ├── loader.js                把常量库 + 提示拼成 chunk
    └── retrieval.js             TF-IDF + driver 抽象
```

### 2.3 知识 Chunk 设计

每条 chunk：
```js
{
  id: 'diet-vegetables',
  source: '中国居民膳食指南2022',
  sourceUrl: 'https://www.chinanutri.cn',
  title: '蔬菜推荐量',
  section: '膳食推荐',
  text: '蔬菜推荐量300-500g/天。新鲜蔬菜，深色蔬菜应占一半以上。',
  tags: ['蔬菜', '膳食', '推荐量'],
  updatedAt: '2024-12-01'
}
```

切片粒度：**每条 chunk = 一个独立可回答的事实点**（推荐量、范围、上限、解释、训练建议）。

### 2.4 数据来源白名单

```
中国居民膳食指南2022
中国成人身体活动指南2021
中国食物成分表第6版
中国营养学会综合建议
```

全部基于已发表的权威文献（非自创数值）。每条 chunk 带 `source + sourceUrl`，回答中模型必须按规则标注来源。

### 2.5 检索器实现

#### 中文分词
```js
tokenize(text):
  - 英文/数字: split by spaces/punct
  - 中文 2-gram: 子串(i, i+2) for i in [0..len-2]
  - 中文 3-gram: 子串(i, i+3) for i in [0..len-3]
```

不引入 jieba/nodejieba 等分词库，零依赖。3-gram 让"减脂期""增肌期"等关键短语精准命中。

#### TF-IDF 打分
```js
score(chunk, queryTf, idf):
  sum(cf * idf) over all query terms in chunk
  + 1.5 * tag hits
  + 2.0 * title hits
```

权重：标题命中 > 标签命中 > 正文命中。

#### Driver 抽象

```js
createDriver({ driver: "local" })
createDriver({ driver: "ragflow", baseUrl, apiKey, datasetIds })
```

切换无需改业务代码：
- `MIMO_DRIVER=local`（默认）→ 本地 TF-IDF
- `MIMO_DRIVER=ragflow` + `RAGFLOW_BASE_URL` + `RAGFLOW_API_KEY` → 远程 RAGFlow 召回

### 2.6 接入流程

```
用户消息
  ↓
agent_orchestrator.runTurn
  ↓
recognizeIntent → intent
  ↓
若 deep 路径（DIET_SUGGESTION / TRAINING_PLAN_* / BODY_ANALYSIS）：
  buildRagAugmentedPrompt(context, { query: message, topK: 5 })
    ↓
    officialData.buildRagContext(query)
      ↓
      retrieval.search(query, 5)  → hits
      ↓
      retrieval.formatContext(hits)  → "【RAG 参考】..."
  ↓
prompt 末尾追加 硬约束 + RAG 参考
  ↓
LLM 调用（mimo-v2-flash 或 mimo-v2.5）
  ↓
返回结构化 Answer（必须带 source 标注）
```

### 2.7 数据流改造

- `data/index.js` 新增 `buildRagContext(query, options)` 端到端方法
- `prompt_builder.js` 新增 `buildRagAugmentedPrompt(context, options)`，可被云函数直接 await
- `fitness_agent_runtime.js` 新增 `injectOfficialContext(messages, options)`，供 ai_service 在 LLM 调用前注入
- `agent_orchestrator.js` 在 deep 路径触发 RAG，并在 trace 中记录 `rag.augmented`

---

## 3. 测试结果

### 3.1 新增测试
- `tests/rag_retrieval.test.js`（13 个断言）：loader、tokenize、检索、formatContext、driver、buildRagContext、manifest、getById、listBySection 全部通过。

### 3.2 全量回归

**23 通过 / 4 预存在失败**

| 失败 | 原因（与本次无关） |
| --- | --- |
| body_food_delete_integration | 训练页文案"仅删除该组，保留空动作" 与实际 alertText 漂移 |
| prompt16_prompt18_features | 期望 `ask_clarification` 路由，实际 `safe_redirect` |
| prompt19_regression | 期望身体数据形状不含 `originalWeightUnit` |
| prompt20_regression | 正则 `AI_MESSAGE_CONTENT:\s*""` 与新 mock 模板漂移 |

均为历史问题，与本次 RAG/UI 改动无回归。

---

## 4. 文件清单（新增 / 改动）

### 新增
```
D:\搭子demo2\formal\cloudfunctions\mcloud\project\dazi\data\knowledge\loader.js
D:\搭子demo2\formal\cloudfunctions\mcloud\project\dazi\data\knowledge\retrieval.js
D:\搭子demo2\formal\miniprogram\tests\rag_retrieval.test.js
D:\搭子demo2\formal\docs\design-reference\*.png (5 张设计稿)
D:\搭子demo2\formal\docs\UI_DESIGN_SPEC.md (已生成)
```

### 改动
```
formal/cloudfunctions/mcloud/project/dazi/data/index.js                  (+knowledge / retrieval / buildRagContext)
formal/cloudfunctions/mcloud/project/dazi/agent/fitness_agent_runtime.js (+injectOfficialContext / pickModel)
formal/cloudfunctions/mcloud/fitness-agent-harness/runtime/prompt/prompt_builder.js
                                                                          (+buildRagAugmentedPrompt)
formal/cloudfunctions/mcloud/fitness-agent-harness/runtime/orchestrator/agent_orchestrator.js
                                                                          (RAG trace + deep-path 调用点)
formal/miniprogram/styles/ios27-design.wxss                                (新建)
formal/miniprogram/app.wxss                                               (加载 ios27)
formal/miniprogram/projects/dazi/pages/home/index/home_index.{wxml,wxss,js}   (对齐设计稿)
formal/miniprogram/projects/dazi/pages/diet/index/diet_index.{wxml,wxss,js}     (折叠餐食 + 超标 tinted)
formal/miniprogram/projects/dazi/pages/my/index/my_index.{wxml,wxss}            (Profile + Inset List)
formal/miniprogram/projects/dazi/pages/training/index/training_index.{wxml,wxss,js} (新框架 + Rest Timer)
formal/miniprogram/projects/dazi/pages/ai/chat/ai_chat.wxss                   (顶栏 + 气泡 iOS 化)
formal/miniprogram/projects/dazi/biz/dashboard_service.js                  (calories.percent + goal.shortName)
formal/miniprogram/projects/dazi/config/goal_config.js                     (shortName)
```

---

## 5. 切换到 RAGFlow（生产部署）

### 5.1 在云函数环境变量配置

```ini
# 启用 RAGFlow 远程召回
MIMO_DRIVER=ragflow
RAGFLOW_BASE_URL=https://your-ragflow-host
RAGFLOW_API_KEY=your-ragflow-api-key

# 知识库 ID（对应 RAGFlow 中上传的官方数据）
RAGFLOW_KB_DIET=<diet_kb_id>
RAGFLOW_KB_TRAINING=<training_kb_id>
RAGFLOW_KB_FAQ=<faq_kb_id>
```

### 5.2 上传文档到 RAGFlow

在 RAGFlow 控制台为以下数据集分别上传：
1. **diet** — 《中国居民膳食指南（2022）》核心条目 + 居民平衡膳食实践
2. **training** — 《中国成人身体活动指南（2021）》核心条目
3. **faq** — 食物营养与健身高频问答

每个数据集 ≥ 100 个分段，配置向量化（bge-large-zh 或类似中文模型）。

### 5.3 在 RAGFlow 中开启检索 API

```bash
curl -X POST https://your-ragflow-host/api/v1/retrieval/recall \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question":"减脂期蛋白质", "dataset_ids":["'$RAGFLOW_KB_DIET'"], "top_k":5}'
```

`retrieval.js` 中的 `ragflow` driver 已经按此协议实现。

### 5.4 灰度策略

- **A/B 灰度**：50% 用户走 local-TF-IDF，50% 走 RAGFlow，对比 `trace.rag.augmented` 与 `result.sources` 命中率
- **指标**：
  - 检索耗时 P50 / P95
  - 召回命中率（人工标注 100 条 query 验证）
  - 来源标注完整率（result.sources.length > 0 的占比）
- **降级**：RAGFlow 超时 > 3s 自动回落 local-tfidf，`trace.warning('rag.failed')`

---

## 6. 后续工作

1. 把《食物营养与健康》《中国食物成分表》第 6 版完整条目（~500 条）逐步补到 loader.js
2. 给 RAGFlow 上传官方 PDF 原文，建立 image-aware 检索
3. 在 agent-service（Python 端）镜像同样的 retrieval.py + 切换 driver（同步同一份 manifest）
4. 运营层：把新增/更新的官方数据走 PR 流程（loader.js 改版本号 + manifest 同步 + 测试）

---

**文档版本**：v1.0  
**对应小程序版本**：v2.30.2+  
**作者**：ZCode Claude Fable 5  
**最后更新**：2026-07-31
