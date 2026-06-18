# Task And MCP Protocol

本文档定义 Web 任务中心与 PC Codex Agent 之间的结构化协议。所有智能处理都由 PC Agent 完成；Web 只保存数据、创建任务、展示结果。

## 1. 公共约定

### 1.1 默认用户

系统底层保留 `ownerId`。MVP 不做登录系统，所有数据默认归属：

```json
{
  "ownerId": "default"
}
```

### 1.2 任务类型

```ts
type TaskType = "analysis" | "practice-generation";
```

### 1.3 任务状态

```ts
type TaskStatus = "pending" | "claimed" | "processing" | "completed" | "failed";
```

含义：

- `pending`：等待 PC Agent 处理。
- `claimed`：PC Agent 已领取。
- `processing`：PC Agent 正在处理。
- `completed`：PC Agent 已回传结果。
- `failed`：处理失败。

## 2. 数据对象

### 2.1 Student

```json
{
  "id": "stu_001",
  "ownerId": "default",
  "name": "张三",
  "currentGrade": "小学五年级",
  "notes": "",
  "profileSummary": "整体学习态度稳定，数学应用题需要加强。",
  "strengths": ["基础计算较稳定"],
  "weaknesses": ["审题不够细", "分数应用题不熟"],
  "trendSummary": "最近两次作答中计算错误减少，但综合题仍偏弱。",
  "createdAt": "2026-06-18T10:00:00.000Z",
  "updatedAt": "2026-06-18T10:00:00.000Z"
}
```

### 2.2 Submission

```json
{
  "id": "sub_001",
  "ownerId": "default",
  "studentId": "stu_001",
  "studentNameSnapshot": "张三",
  "grade": "小学五年级",
  "subject": "数学",
  "imageUrls": ["/api/files/img_001"],
  "notes": "课后测验",
  "analysisStatus": "pending",
  "analysisResult": null,
  "layoutSnapshot": null,
  "recommendedPracticePlan": null,
  "createdAt": "2026-06-18T10:00:00.000Z"
}
```

### 2.3 LayoutSnapshot

Agent 识别到的原作答题型和数量结构。出卷时如果选择“沿用原卷版式”，必须严格遵守。

```json
{
  "orientation": "portrait",
  "sections": [
    {
      "name": "一、填空题",
      "questionTypeName": "填空题",
      "count": 8,
      "order": 1,
      "notes": "基础概念题"
    },
    {
      "name": "二、应用题",
      "questionTypeName": "应用题",
      "count": 4,
      "order": 2,
      "notes": "分数应用为主"
    }
  ]
}
```

### 2.4 AnalysisResult

```json
{
  "submissionId": "sub_001",
  "studentId": "stu_001",
  "overallComment": "本次作答基础题较稳，综合应用题需要加强。",
  "correctnessOverview": {
    "correctCount": 10,
    "wrongCount": 4,
    "partialCount": 1,
    "unableCount": 0
  },
  "strengths": ["基础计算较稳定", "能正确套用简单公式"],
  "weaknesses": ["应用题审题不足", "单位换算不稳定"],
  "suggestions": ["复习分数应用题", "增加单位换算专项练习"],
  "knowledgePoints": [
    {
      "name": "分数应用题",
      "status": "weak",
      "evidence": "应用题中多次未能正确建立数量关系"
    }
  ],
  "layoutSnapshot": {
    "orientation": "portrait",
    "sections": []
  },
  "recommendedPracticePlan": {
    "basis": "submission",
    "focus": ["分数应用题", "单位换算"],
    "layoutPolicy": "same-as-source",
    "sections": []
  }
}
```

### 2.5 StudentProfilePatch

Agent 不直接修改学生档案，而是回传建议，由服务器落库。

```json
{
  "studentId": "stu_001",
  "currentGrade": "小学五年级",
  "profileSummary": "近期数学基础题稳定，应用题仍需持续训练。",
  "strengths": ["基础计算较稳定"],
  "weaknesses": ["应用题审题不足", "单位换算不稳定"],
  "trendSummary": "较上次计算错误减少，但综合应用题表现仍波动。"
}
```

### 2.6 PracticeGenerationResult

```json
{
  "practiceTaskId": "pt_001",
  "studentId": "stu_001",
  "submissionId": "sub_001",
  "title": "小学五年级数学分数应用巩固卷",
  "layoutUsed": {
    "orientation": "portrait",
    "sections": []
  },
  "focus": ["分数应用题", "单位换算"],
  "files": [
    {
      "kind": "practice-paper",
      "fileName": "practice-paper.pdf",
      "mimeType": "application/pdf"
    },
    {
      "kind": "answer-key",
      "fileName": "answer-key.md",
      "mimeType": "text/markdown"
    }
  ],
  "summary": "已按原卷题型数量生成一套针对性练习。"
}
```

## 3. Web API

### 3.1 学生

```http
GET /api/students
POST /api/students
GET /api/students/{studentId}
PATCH /api/students/{studentId}
```

规则：

- `name` 全局唯一。
- 上传模块遇到新姓名自动创建学生。
- 上传模块遇到已有姓名复用学生。

### 3.2 作答上传

```http
POST /api/upload-batches
```

请求：

```json
{
  "title": "6 月 18 日数学作业",
  "students": [
    {
      "name": "张三",
      "submissions": [
        {
          "grade": "小学五年级",
          "subject": "数学",
          "notes": "课后测验",
          "images": [
            {
              "name": "page-1.jpg",
              "dataUrl": "data:image/jpeg;base64,..."
            }
          ],
          "requestPracticeSuggestion": true
        }
      ]
    }
  ]
}
```

响应：

```json
{
  "batchId": "batch_001",
  "analysisTaskId": "at_001",
  "submissionIds": ["sub_001"]
}
```

### 3.3 分析任务

```http
GET /api/analysis-tasks
GET /api/analysis-tasks/{taskId}
```

### 3.4 出卷任务

```http
POST /api/practice-tasks
GET /api/practice-tasks
GET /api/practice-tasks/{taskId}
```

创建出卷任务请求：

```json
{
  "mode": "submission",
  "studentIds": ["stu_001"],
  "submissionIds": ["sub_001"],
  "templateId": null,
  "layout": {
    "source": "submission-layout",
    "orientation": "portrait",
    "sections": []
  },
  "knowledgePointIds": ["kp_001"],
  "requirements": "保持原题型数量，加强分数应用题"
}
```

## 4. MCP Tools

MCP endpoint：

```text
/paper-analyzer/mcp
```

所有请求携带：

```text
Authorization: Bearer <WORKER_TOKEN>
Content-Type: application/json
Accept: application/json, text/event-stream
```

### 4.1 list_pending_tasks

列出待处理任务。

输入：

```json
{
  "taskType": "analysis",
  "limit": 5
}
```

输出：

```json
[
  {
    "id": "at_001",
    "taskType": "analysis",
    "status": "pending",
    "submissionCount": 3,
    "createdAt": "2026-06-18T10:00:00.000Z"
  }
]
```

### 4.2 claim_task

领取任务。

输入：

```json
{
  "taskId": "at_001"
}
```

### 4.3 get_analysis_task

读取分析任务完整输入。

输出包含：

- 上传批次。
- 学生档案。
- 作答记录。
- 图片 URL。
- 题型库。
- 模板库。
- 知识点库。

### 4.4 submit_analysis_result

提交分析结果。

输入：

```json
{
  "taskId": "at_001",
  "submissionResults": [
    {
      "submissionId": "sub_001",
      "analysisResult": {},
      "layoutSnapshot": {},
      "recommendedPracticePlan": {}
    }
  ],
  "studentProfilePatches": [
    {
      "studentId": "stu_001",
      "profileSummary": "...",
      "strengths": [],
      "weaknesses": [],
      "trendSummary": "..."
    }
  ],
  "knowledgePointSuggestions": [
    {
      "subject": "数学",
      "gradeRange": ["小学五年级"],
      "name": "分数应用题"
    }
  ],
  "summary": "分析完成"
}
```

### 4.5 get_practice_task

读取出卷任务完整输入。

输出包含：

- 出卷模式。
- 学生档案。
- 作答分析结果。
- 模板或版式。
- 知识点范围。
- 用户补充要求。

### 4.6 upload_result_file

上传结果文件。

输入：

```json
{
  "taskId": "pt_001",
  "fileName": "practice-paper.pdf",
  "contentBase64": "...",
  "mimeType": "application/pdf",
  "kind": "practice-paper",
  "summary": "复习卷 PDF"
}
```

### 4.7 submit_practice_result

提交出卷任务结果。

输入：

```json
{
  "taskId": "pt_001",
  "result": {},
  "summary": "出卷完成"
}
```

### 4.8 fail_task

标记任务失败。

输入：

```json
{
  "taskId": "at_001",
  "message": "第二位学生图片缺失，无法分析。"
}
```

## 5. PC Agent 输出要求

### 5.1 分析任务必须回传

- `submissionResults`
- `layoutSnapshot`
- `recommendedPracticePlan`
- `studentProfilePatches`

### 5.2 出卷任务必须回传

- 试卷文件。
- 答案文件。
- 结构化 `PracticeGenerationResult`。

### 5.3 文件类型建议

- Markdown：便于网页预览和二次编辑。
- PDF：便于打印。
- DOCX：便于 Windows PC 侧人工调整。
- JSON：便于系统落库。
