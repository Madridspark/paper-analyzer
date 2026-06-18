# Paper Analyzer Task Protocol

本文档定义手机任务站、服务器任务中心、PC Codex Agent 之间的数据协议。当前仓库只实现任务中心和 MCP 交互，不实现 PC 上实际批改试卷内容的 Skill。

## 1. 角色边界

### 手机网页

- 创建试卷处理任务。
- 上传试卷图片。
- 查看任务状态。
- 下载 PC Agent 回传的报告、新试卷和答案。

### 服务器

- 保存任务元数据。
- 保存原始图片。
- 保存处理结果。
- 提供普通 HTTP API 给手机网页。
- 提供 MCP 工具给 PC Codex Agent。

### PC Codex Agent

- 通过 MCP 领取任务。
- 读取图片和任务要求。
- 使用本地 `paper-analyzer` Skill 批改、分析、生成练习。
- 生成 Markdown、DOCX、PDF 或 JSON 结果。
- 通过 MCP 回传结果并更新状态。

## 2. 任务状态

| 状态 | 含义 |
| --- | --- |
| `pending` | 手机端已上传，等待 PC Agent 处理 |
| `claimed` | PC Agent 已领取任务 |
| `processing` | PC Agent 正在处理 |
| `completed` | PC Agent 已回传结果 |
| `failed` | 处理失败 |

## 3. Task Schema

```json
{
  "id": "uuid",
  "status": "pending",
  "statusMessage": "等待 PC Codex Agent 处理",
  "grade": "小学五年级",
  "subject": "数学",
  "studentName": "可选",
  "practiceCount": 10,
  "difficulty": "巩固",
  "notes": "重点看计算过程",
  "images": [
    {
      "id": "uuid",
      "name": "page-1.jpg",
      "fileName": "01-page-1.jpg",
      "mimeType": "image/jpeg",
      "url": "/api/tasks/{taskId}/images/01-page-1.jpg"
    }
  ],
  "results": [
    {
      "id": "uuid",
      "kind": "report",
      "name": "report.md",
      "fileName": "report.md",
      "mimeType": "text/markdown",
      "summary": "本次主要薄弱点是分数应用题。",
      "url": "/api/tasks/{taskId}/results/report.md",
      "createdAt": "2026-06-18T10:00:00.000Z"
    }
  ],
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

## 4. Web API

### 创建任务

```http
POST /api/tasks
Content-Type: application/json
```

请求：

```json
{
  "grade": "小学五年级",
  "subject": "数学",
  "studentName": "",
  "practiceCount": 10,
  "difficulty": "巩固",
  "notes": "生成一份可打印练习",
  "images": [
    {
      "name": "page-1.jpg",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  ]
}
```

### 查询任务

```http
GET /api/tasks
GET /api/tasks/{taskId}
```

### 读取文件

```http
GET /api/tasks/{taskId}/images/{fileName}
GET /api/tasks/{taskId}/results/{fileName}
```

## 5. MCP Tools

MCP endpoint：

```text
/mcp
```

公网部署在路径前缀下时：

```text
/paper-analyzer/mcp
```

所有 MCP 请求需要携带：

```text
Authorization: Bearer <WORKER_TOKEN>
```

### list_pending_tasks

列出等待处理的任务。

输入：

```json
{
  "limit": 5
}
```

### claim_task

领取任务。只有 `pending` 任务可以领取。

输入：

```json
{
  "taskId": "uuid"
}
```

### get_task

读取任务详情。

输入：

```json
{
  "taskId": "uuid"
}
```

### update_task_status

更新任务状态。

输入：

```json
{
  "taskId": "uuid",
  "status": "processing",
  "message": "正在识别试卷图片"
}
```

### upload_result_file

上传结果文件。

输入：

```json
{
  "taskId": "uuid",
  "fileName": "report.md",
  "contentBase64": "IyDmiqXlkY..."
  "mimeType": "text/markdown",
  "kind": "report",
  "summary": "本次主要薄弱点是分数应用题。"
}
```

`kind` 可选值：

- `report`
- `practice-paper`
- `answer-key`
- `summary`
- `attachment`

### submit_task_result

所有结果上传完成后，将任务标记为完成。

输入：

```json
{
  "taskId": "uuid",
  "summary": "处理完成，已生成报告和练习卷。"
}
```

### fail_task

处理失败时写入原因。

输入：

```json
{
  "taskId": "uuid",
  "message": "第二页图片过于模糊，无法完成批改。"
}
```
