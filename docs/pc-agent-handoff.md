# PC Agent Handoff

本文档给 Windows PC 上的新 Codex Agent 使用。目标是把家里 PC 接入 Paper Analyzer 公网任务中心，并在 PC 本机实现试卷分析、题库导入、难度校准和出卷 Skill。

## 1. 当前系统信息

GitHub 仓库：

```text
git@github.com:Madridspark/paper-analyzer.git
```

HTTPS 备用地址：

```text
https://github.com/Madridspark/paper-analyzer.git
```

当前工作分支：

```text
codex/mvp
```

公网网页：

```text
http://149.28.145.184/paper-analyzer/
```

MCP endpoint：

```text
http://149.28.145.184/paper-analyzer/mcp
```

服务器：

```text
Host: 149.28.145.184
User: linuxuser
Suggested SSH alias: ai-tools
Project path: ~/apps/paper-analyzer
Worker token path: ~/apps/paper-analyzer/worker-token.txt
Container: paper-analyzer
Docker network: web
Data volume: paper_analyzer_data
```

注意：Windows PC 初始状态可能没有配置 GitHub SSH，也没有配置服务器 SSH。不要假设 SSH 已经可用。

## 2. 第一阶段目标

先不要改网页功能。PC Agent 第一阶段只做这些事：

1. 配好 Windows PC 到 GitHub 和服务器的访问能力。
2. 克隆仓库并切到 `codex/mvp`。
3. 阅读并核对：
   - `docs/prd.md`
   - `docs/task-protocol.md`
   - `docs/pc-agent.md`
   - `docs/pc-question-bank-guide.md`
   - `docs/pc-agent-handoff.md`
4. 获取 `WORKER_TOKEN`，本机保存为私密环境变量或本地未入库配置。
5. 验证 MCP 可访问。
6. 设计并实现本机 Codex Skill：
   - `paper-analysis`
   - `practice-generation`
   - `paper-ingestion`
   - `difficulty-calibration`
7. 用少量样例跑通“领取任务 -> 处理 -> 回传结果”闭环。

## 3. Windows 首次 SSH 配置

### 3.1 检查现状

在 Windows PowerShell 中检查：

```powershell
git --version
ssh -V
ssh -T git@github.com
ssh linuxuser@149.28.145.184
```

如果 GitHub SSH 不通，生成密钥：

```powershell
ssh-keygen -t ed25519 -C "paper-analyzer-pc"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

把公钥交给用户添加到 GitHub：

```text
GitHub -> Settings -> SSH and GPG keys -> New SSH key
```

如果服务器 SSH 不通，同一把公钥也需要加入服务器：

```text
/home/linuxuser/.ssh/authorized_keys
```

如果 PC Agent 无法直接写入服务器 `authorized_keys`，请让用户在另一台已能登录服务器的机器上添加。不要要求用户把私钥发给 Agent。

建议 Windows `~/.ssh/config`：

```sshconfig
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519

Host ai-tools
  HostName 149.28.145.184
  User linuxuser
  IdentityFile ~/.ssh/id_ed25519
```

验证：

```powershell
ssh -T git@github.com
ssh ai-tools "hostname && ls ~/apps/paper-analyzer"
```

## 4. 克隆仓库

优先用 SSH：

```powershell
git clone git@github.com:Madridspark/paper-analyzer.git
cd paper-analyzer
git checkout codex/mvp
git pull
```

如果 GitHub SSH 尚未配置完成，可以先用 HTTPS 只读克隆：

```powershell
git clone https://github.com/Madridspark/paper-analyzer.git
cd paper-analyzer
git checkout codex/mvp
git pull
```

## 5. 获取 Worker Token

如果服务器 SSH 已通：

```powershell
ssh ai-tools "cat ~/apps/paper-analyzer/worker-token.txt"
```

把结果保存到本机私密环境变量，不要写入 Git：

```powershell
setx PAPER_ANALYZER_MCP_URL "http://149.28.145.184/paper-analyzer/mcp"
setx PAPER_ANALYZER_WORKER_TOKEN "<从服务器读取到的 token>"
```

当前 PowerShell 会话中也设置一次：

```powershell
$env:PAPER_ANALYZER_MCP_URL="http://149.28.145.184/paper-analyzer/mcp"
$env:PAPER_ANALYZER_WORKER_TOKEN="<从服务器读取到的 token>"
```

如果服务器 SSH 暂时不通，请让用户从服务器读取 `~/apps/paper-analyzer/worker-token.txt` 后粘贴给 PC Agent。不要把 token 提交到仓库。

## 6. MCP 连通性验证

使用 MCP 协议时请求头必须同时包含：

```text
Authorization: Bearer <WORKER_TOKEN>
Content-Type: application/json
Accept: application/json, text/event-stream
```

PowerShell 验证示例：

```powershell
$headers = @{
  "Authorization" = "Bearer $env:PAPER_ANALYZER_WORKER_TOKEN"
  "Content-Type" = "application/json"
  "Accept" = "application/json, text/event-stream"
}
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
Invoke-WebRequest -Uri $env:PAPER_ANALYZER_MCP_URL -Method POST -Headers $headers -Body $body
```

预期：返回 HTTP 200，内容中包含 `list_pending_tasks`、`claim_task`、`get_analysis_task`、`submit_analysis_result`、`get_practice_task`、`upload_result_file`、`submit_practice_result`、`fail_task`。

未带 token 时应返回 401。

## 7. PC 本机 Skill 目录建议

建议把 Skill 放在 Windows PC 的 Codex 用户目录下，不放进本仓库，避免把本机自动化细节和私密配置推到 Git。

建议 Skill：

```text
paper-analysis
practice-generation
paper-ingestion
difficulty-calibration
```

四个 Skill 的职责见 `docs/pc-agent.md`。

## 8. 本机数据目录建议

用户的 Windows PC 只有一个 4T 的 C 盘。题库固定根目录为 `C:\Users\madri\Documents\questions-lib`。默认所有题库、缓存、输出和日志都放在该目录下，不要写 `D:\`、`E:\` 等路径，除非用户明确指定新增磁盘。

建议创建本机工作目录：

```text
C:\Users\madri\Documents\questions-lib\
  source-roots\
  incoming\
  samples\
  question-bank\
  cache\
  benchmark-papers\
  outputs\
  logs\
```

建议约定：

- `incoming`：临时下载的任务图片和输入文件。
- `source-roots`：记录用户提供的源文件根目录清单；不要移动原始网盘文件。
- `samples`：用户提供的黄金样例。
- `question-bank`：本机 SQLite 题库、全文索引、去重索引。
- `cache`：页图、缩略图、OCR 中间结果、题图/公式/表格裁剪。
- `benchmark-papers`：难度 3、5、7、10 基准卷。
- `outputs`：生成的试卷、答案、JSON。
- `logs`：任务处理日志。

所有目录中的真实学生数据都不要提交到 GitHub。

题库建设细节见 `docs/pc-question-bank-guide.md`。核心要求：

- 全自动运行，不依赖人工审核。
- 支持增量扫描，用户后续往源目录新增文件后，只处理新增或变化文件。
- 原始网盘文件不移动、不重命名，只建立虚拟分类视图。
- 出卷时不回原 PDF 现读题，不现 OCR；出卷只读取 SQLite 结构化题目和本地 asset。
- 题目保留多表示：搜索纯文本、展示 Markdown/LaTeX、结构化 block、原题裁剪图、题图/公式 asset。

## 9. 题库建设要求

不要抓取百度文库、网盘或其他未授权内容作为默认数据源。题库来源优先级：

1. 用户自己已有的纸质卷、PDF、Word、图片、历史手工处理材料。
2. 老师或机构授权材料。
3. 用户购买并允许自用整理的题库或教辅。
4. 大模型生成并通过自动校验的题目。

每道题建议保存为结构化 JSON：

```json
{
  "id": "q_local_001",
  "grade": "小学五年级",
  "subject": "数学",
  "textbookVersion": "北师大版",
  "knowledgePoints": ["分数应用题"],
  "questionTypeName": "应用题",
  "difficulty": 7,
  "difficultyFactors": {
    "knowledgeDepth": 2,
    "reasoningSteps": 3,
    "conditionComplexity": 2,
    "trapLevel": 1,
    "expressionLoad": 2
  },
  "stem": "题干",
  "answer": "答案",
  "analysis": "解析",
  "source": {
    "type": "user-provided",
    "name": "2026-06-xx 用户提供练习",
    "licenseNote": "仅个人自用"
  },
  "contentStatus": "structured",
  "usableForGeneration": true,
  "similarityHash": "",
  "createdAt": "2026-06-18T00:00:00.000Z"
}
```

## 10. 难度基准卷要求

长期目标是每个年级×学科准备 4 套基准卷：

```text
D3  基础常规
D5  校内中等
D7  拔高综合
D10 强区分度/竞赛风格
```

当前不要一次性追求全覆盖。先选用户最常用的年级和学科做样例，例如：

```text
小学五年级 数学
小学五年级 语文
小学五年级 英语
初中一年级 数学
```

基准卷可以来自用户已有材料，也可以由大模型生成后自动校验。PC Agent 应输出每套基准卷的结构化元数据：

```json
{
  "grade": "小学五年级",
  "subject": "数学",
  "difficultyAnchor": 7,
  "orientation": "landscape",
  "sections": [
    { "name": "一、填空题", "questionTypeName": "填空", "count": 10, "order": 1 }
  ],
  "source": "user-provided",
  "qualityNotes": "用于校准 D7，不直接公开传播。"
}
```

## 11. 默认模板要求

网页端已经有模板库，但 PC Agent 后续可以补充更完整的默认模板建议。要求：

- 每个年级×学科至少一套标准版式。
- 内置默认模板统一使用横版：`orientation = "landscape"`。
- 题型名称只保存名称，不要保存成 `学科 · 题型`。
- 模板只描述模块、题型、数量、顺序，不复制具体题目。

## 12. 任务处理循环

每轮只处理一个任务：

1. 先查 `analysis`。
2. 有任务就领取、处理、回传。
3. 没有分析任务，再查 `practice-generation`。
4. 有任务就领取、生成文件、上传、回传。
5. 任何失败都调用 `fail_task`，写明可读原因。

不要并发领取多个任务。不要在任务处理中修改服务器代码。不要编造看不清的图片内容。

## 13. 验收清单

第一阶段完成时，PC Agent 应向用户报告：

- GitHub 仓库是否已克隆到本机。
- 当前分支和最新 commit。
- GitHub SSH 是否可用。
- 服务器 SSH 是否可用。
- MCP tools/list 是否成功。
- 本机 Skill 是否已创建。
- 是否用一个样例跑通过分析任务。
- 是否用一个样例跑通过出卷任务。
- 如果有阻塞，明确卡在哪一步，以及需要用户提供什么。
