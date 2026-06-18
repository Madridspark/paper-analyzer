# PC Codex Agent Guide

本文档给家里 Windows PC 上的 Codex Agent 使用。当前 Git 项目已经实现手机任务站、任务存储和 MCP 工具；PC 只需要连接 MCP，并在本机实现/调试 `paper-analyzer` Skill。

## 1. 职责

PC Codex Agent 只负责处理试卷内容：

1. 从 MCP 获取待处理任务。
2. 下载任务图片。
3. 使用本机 `paper-analyzer` Skill 完成批改、分析和出题。
4. 生成结果文件。
5. 通过 MCP 上传结果。
6. 标记任务完成或失败。

不要在 PC 侧实现手机上传页面、任务列表页面或公网服务。

## 2. MCP 连接

服务器 MCP endpoint：

```text
http://149.28.145.184/paper-analyzer/mcp
```

请求头：

```text
Authorization: Bearer <WORKER_TOKEN>
```

`WORKER_TOKEN` 由服务器部署环境提供，不写入 Git。

## 3. 推荐处理流程

每次自动化运行时执行：

1. 调用 `list_pending_tasks`，`limit` 设为 1。
2. 如果没有任务，结束本轮。
3. 调用 `claim_task` 领取任务。
4. 调用 `update_task_status`，状态设为 `processing`。
5. 调用 `get_task` 获取图片 URL、年级、学科和要求。
6. 下载所有图片到本地临时目录。
7. 使用本机 `paper-analyzer` Skill 处理。
8. 至少生成：
   - `report.md`
   - `practice-paper.md`
   - `answer-key.md`
   - `summary.json`
9. 如本机有 Word/PDF 工具，可额外生成：
   - `report.docx`
   - `practice-paper.pdf`
10. 对每个结果文件调用 `upload_result_file`。
11. 调用 `submit_task_result`。
12. 如果任何关键步骤失败，调用 `fail_task`，写明原因。

## 4. Skill 输出约定

PC 侧 `paper-analyzer` Skill 应尽量稳定输出这些文件。

### report.md

包含：

- 基本信息：年级、学科、学生、任务 ID。
- 总体表现。
- 逐题批改。
- 错因分析。
- 薄弱知识点。
- 学习建议。

### practice-paper.md

包含：

- 新试卷标题。
- 题目列表。
- 分值。
- 答题区域。
- 知识点标签。

### answer-key.md

包含：

- 每题答案。
- 每题解析。
- 对应知识点。

### summary.json

建议结构：

```json
{
  "taskId": "uuid",
  "status": "completed",
  "score": {
    "total": 100,
    "student": 78
  },
  "weakKnowledgePoints": ["分数应用题", "单位换算"],
  "errorReasons": ["审题错误", "计算错误"],
  "resultFiles": ["report.md", "practice-paper.md", "answer-key.md"]
}
```

## 5. 自动化提示词草案

可以给 Windows PC 上的 Codex automation 使用：

```text
连接 Paper Analyzer MCP server，检查待处理任务。若存在任务，只领取一个任务并处理：
1. claim 任务；
2. 读取任务元数据和图片；
3. 使用本机 paper-analyzer Skill 批改试卷、分析薄弱点并生成新练习；
4. 生成 report.md、practice-paper.md、answer-key.md、summary.json；
5. 上传所有结果文件；
6. submit_task_result；
7. 失败时调用 fail_task 并说明原因。

不要处理多个任务；不要修改服务器项目代码；不要在缺少图片时编造内容。
```

## 6. 调试建议

- 先用一份你手动处理过的试卷做黄金样例。
- 对比 Skill 输出与人工批改结果。
- 先稳定 Markdown 输出，再做 DOCX/PDF。
- 复杂过程题允许标记为需人工复核。
- 遇到图片不清晰时优先失败或要求重传，不要强行编造题目。
