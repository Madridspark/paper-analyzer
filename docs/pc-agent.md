# PC Codex Agent Guide

本文档给家里 Windows PC 上的 Codex Agent 使用。当前 Git 项目负责网页、数据管理、任务中心和 MCP；Windows PC 负责真正的试卷分析和出卷能力。

配套启动任务书见 `docs/pc-agent-handoff.md`。题库建设行动指南见 `docs/pc-question-bank-guide.md`。PC Agent 第一次接入时，应先阅读这些文件，再阅读本文档和 `docs/task-protocol.md`。

## 1. 推荐 Skill 拆分

建议在 Windows PC 上维护四个 Skill，先实现前两个，后两个用于解决题目质量和难度稳定性。

### 1.1 paper-analysis

用于分析上传的学生作答。

职责：

- 读取多个学生、多个作答记录。
- 检查图片质量。
- 识别每份作答的年级、学科上下文。
- 识别题型结构和题目数量。
- 判断题目对错概览。
- 输出本次优点、不足和建议。
- 输出 `layoutSnapshot`。
- 输出 `recommendedPracticePlan`。
- 输出学生档案更新建议。
- 必要时输出新增知识点建议。

不负责：

- 生成完整复习卷。
- 修改网页代码。
- 直接改数据库。

### 1.2 practice-generation

用于生成复习卷。

职责：

- 根据出卷任务读取模板、版式、学生档案、作答分析和知识点范围。
- 严格遵守题型模块、题目数量、顺序和横竖版。
- 针对学生弱点生成题目。
- 生成试卷、答案、解析。
- 输出 Markdown、PDF、DOCX 或 JSON 文件。

不负责：

- 重新分析图片。
- 改动学生档案。
- 合并多个出卷任务，除非任务本身是批量统一出卷。

### 1.3 paper-ingestion

用于把已有 PDF、图片、Word、手工整理题目导入题库。

职责：

- 从本机目录读取来源材料。
- OCR 或解析文档。
- 拆分为单题。
- 标注年级、学科、教材版本、知识点、题型、答案、解析、来源。
- 进行相似题去重。
- 给出难度初评。
- 输出可直接增量写入本机 SQLite 的结构化题库记录。

不负责：

- 爬取百度文库、网盘或其他未授权内容。
- 绕过登录、付费、反爬或版权限制。
- 移动、重命名或物理重排用户下载的原始源文件。

### 1.4 difficulty-calibration

用于用基准卷校准题目难度。

职责：

- 维护难度 1-10 的解释性标准。
- 为每个年级×学科整理难度 3、5、7、10 的基准卷。
- 用基准卷反推题目难度标尺。
- 对题库题目进行难度复评。
- 输出题目难度、评分因子和校准依据。

不负责：

- 单独决定教学目标。
- 用没有来源或质量不可控的卷子作为基准卷。

## 1.5 题库与难度原则

出卷 Skill 不应长期依赖大模型凭空生成题目。大模型直接出题容易偏简单、重复率高、难度漂移大。正确策略是：

- 优先从题库检索题目。
- 题库不足时允许大模型补题。
- 补题必须经过答案校验、难度校验、相似度去重。
- 新题通过自动校验后可写入题库，并记录来源为 `generated`。
- 出卷结果必须记录题目来源：`bank`、`generated`、`variant`。
- 建库不依赖人工审核；题目是否适合直接出卷由 `contentStatus`、`usableForGeneration` 和资产完整性字段表达。

难度采用 1-10 分：

- `1-2`：基础识记、直接套公式、单知识点。
- `3-4`：常规校内题，轻微变形，1-2 步。
- `5-6`：中等综合，需要审题转换或多个知识点。
- `7-8`：拔高题，多步骤、多条件，易错点明显。
- `9`：压轴或综合探究，解法选择要求高。
- `10`：竞赛或强区分度题，只作为高阶基准，不宜频繁给普通学生。

题目难度输出建议：

```json
{
  "difficulty": 7,
  "difficultyFactors": {
    "knowledgeDepth": 2,
    "reasoningSteps": 3,
    "conditionComplexity": 2,
    "trapLevel": 1,
    "expressionLoad": 2
  },
  "calibrationBasis": "接近小学五年级数学 D7 基准卷第 4 模块"
}
```

## 1.6 基准卷目标

长期目标：每个年级×学科内置 4 套基准卷：

- `D3`：基础常规卷。
- `D5`：校内中等卷。
- `D7`：拔高综合卷。
- `D10`：强区分度/竞赛风格卷。

基准卷来源优先级：

1. 用户已有真实卷、老师整理卷、机构合法内部材料。
2. 用户购买或授权的题库/教辅内容。
3. 大模型生成后通过自动校验的卷。

不要把“抓取百度文库或网盘 PDF”作为默认方案。遇到来源不清、登录受限、付费受限、版权不明的材料时，应停止并要求用户提供合法来源。

## 2. MCP 连接

服务器 MCP endpoint：

```text
http://149.28.145.184/paper-analyzer/mcp
```

请求头：

```text
Authorization: Bearer <WORKER_TOKEN>
Content-Type: application/json
Accept: application/json, text/event-stream
```

`WORKER_TOKEN` 在服务器：

```text
~/apps/paper-analyzer/worker-token.txt
```

不要写入 Git。

## 3. 自动化策略

建议每次 automation 只处理一个任务，降低失败影响。

优先级：

1. 优先处理 `analysis` 任务，因为分析会解锁后续出卷。
2. 没有分析任务时，再处理 `practice-generation` 任务。
3. 如果任务失败，调用 `fail_task`，写清楚原因。

## 4. 分析任务流程

1. 调用 `list_pending_tasks`，参数：

```json
{
  "taskType": "analysis",
  "limit": 1
}
```

2. 如无任务，结束本轮。
3. 调用 `claim_task`。
4. 调用 `get_analysis_task`。
5. 下载所有作答图片。
6. 使用 `paper-analysis` Skill 分析。
7. 按 `submit_analysis_result` schema 回传：
   - 每个作答的分析结果。
   - 每个作答的版式识别。
   - 每个作答的建议出卷方案。
   - 每个学生的档案更新建议。
   - 新知识点建议。
8. 成功后任务完成。
9. 失败时调用 `fail_task`。

## 5. 出卷任务流程

1. 调用 `list_pending_tasks`，参数：

```json
{
  "taskType": "practice-generation",
  "limit": 1
}
```

2. 如无任务，结束本轮。
3. 调用 `claim_task`。
4. 调用 `get_practice_task`。
5. 使用 `practice-generation` Skill 生成试卷。
6. 至少生成：
   - `practice-paper.md`
   - `answer-key.md`
   - `practice-result.json`
7. 如果本机文档工具可用，额外生成：
   - `practice-paper.pdf`
   - `practice-paper.docx`
8. 对每个文件调用 `upload_result_file`。
9. 调用 `submit_practice_result`。

## 6. 分析 Skill 输出格式

### 6.1 submissionResults

每个作答必须输出一个结果。

```json
{
  "submissionId": "sub_001",
  "analysisResult": {
    "overallComment": "基础题较稳，综合应用题需要加强。",
    "correctnessOverview": {
      "correctCount": 10,
      "wrongCount": 4,
      "partialCount": 1,
      "unableCount": 0
    },
    "strengths": ["基础计算较稳定"],
    "weaknesses": ["应用题审题不足"],
    "suggestions": ["练习分数应用题"],
    "knowledgePoints": [
      {
        "name": "分数应用题",
        "status": "weak",
        "evidence": "应用题数量关系建立不稳定"
      }
    ]
  },
  "layoutSnapshot": {
    "orientation": "portrait",
    "sections": [
      {
        "name": "一、填空题",
        "questionTypeName": "填空题",
        "count": 8,
        "order": 1,
        "notes": ""
      }
    ]
  },
  "recommendedPracticePlan": {
    "basis": "submission",
    "focus": ["分数应用题"],
    "layoutPolicy": "same-as-source",
    "sections": []
  }
}
```

### 6.2 studentProfilePatches

每个涉及的学生都建议输出。

```json
{
  "studentId": "stu_001",
  "currentGrade": "小学五年级",
  "profileSummary": "数学基础计算稳定，应用题需要持续训练。",
  "strengths": ["计算基础较稳定"],
  "weaknesses": ["审题不够细"],
  "trendSummary": "相较上次，计算错误减少，但综合题仍波动。"
}
```

## 7. 出卷 Skill 输出格式

### 7.1 practice-result.json

```json
{
  "practiceTaskId": "pt_001",
  "title": "小学五年级数学分数应用巩固卷",
  "layoutUsed": {
    "orientation": "portrait",
    "sections": []
  },
  "focus": ["分数应用题"],
  "files": ["practice-paper.md", "answer-key.md", "practice-paper.pdf"],
  "summary": "已按原卷题型数量生成一套针对性练习。"
}
```

### 7.2 practice-paper.md

要求：

- 标题清晰。
- 按模块输出。
- 模块顺序与任务版式一致。
- 每个模块题目数量与任务版式一致。
- 不要泄露答案。

### 7.3 answer-key.md

要求：

- 按题号输出答案。
- 给出简短解析。
- 标注对应知识点。

## 8. 自动化提示词草案

```text
连接 Paper Analyzer MCP server。每轮只处理一个任务。

先检查 analysis 任务：
1. list_pending_tasks(taskType="analysis", limit=1)；
2. 如果有任务，claim_task；
3. get_analysis_task；
4. 下载图片；
5. 使用 paper-analysis Skill 生成 submissionResults、studentProfilePatches、knowledgePointSuggestions；
6. submit_analysis_result；
7. 失败时 fail_task。

如果没有 analysis 任务，再检查 practice-generation 任务：
1. list_pending_tasks(taskType="practice-generation", limit=1)；
2. 如果有任务，claim_task；
3. get_practice_task；
4. 使用 practice-generation Skill 生成复习卷、答案和结构化摘要；
5. upload_result_file 上传所有文件；
6. submit_practice_result；
7. 失败时 fail_task。

不要同时处理多个任务。不要修改服务器项目代码。不要编造看不清的图片内容。
```

## 9. 调试建议

- 用以往手动处理过的试卷作为黄金样例。
- 先调 `paper-analysis`，确认版式识别和学生档案更新建议稳定。
- 再调 `practice-generation`，确认题型数量和顺序严格遵守模板。
- 先稳定 Markdown 和 JSON，再做 DOCX/PDF。
- 如果图片不清晰，明确回传失败原因或在分析结果中标记无法判断。
- 不做学生分数排名，不输出伤害性评价。
