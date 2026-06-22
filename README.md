# Paper Analyzer

面向自用场景的试卷任务中心。手机端上传试卷照片，家里 Windows PC 上的 Codex Agent 通过 MCP 领取任务、处理试卷，并把报告和新试卷回传到服务器。

## 功能

- 手机网页创建试卷处理任务。
- 单页提交多个学生、多个作答记录。
- 输入学生名称时联想已有学生，也可以直接输入新学生。
- 查看分析任务、出卷任务、学生档案、作答历史和处理结果。
- 独立出卷工作台，支持按学生、按作答、按模板、批量出卷。
- 题型管理、试卷模板管理、知识点库展示。
- 内置西安城六区教材版本配置和小学/初中主要学科知识点 JSON。
- 提供 MCP 接口给 PC Codex Agent 领取任务和回传结果。
- 支持 Docker 部署到公网服务器。

## 本地开发

需要 Node.js 20.19 或更高版本。

```bash
npm install
npm run api
npm run dev
```

开发访问地址：

```text
http://localhost:5173
```

## 生产运行

```bash
npm run build
npm start
```

生产访问地址默认是：

```text
http://localhost:8787
```

可以通过 `PORT` 修改端口。

任务数据默认保存在 `data/`，生产环境建议设置：

```bash
DATA_DIR=/data
WORKER_TOKEN=你的-worker-token
```

如果部署在路径前缀下，例如 `/paper-analyzer/`，构建时设置：

```bash
VITE_BASE_PATH=/paper-analyzer/ npm run build
```

## Docker

```bash
docker build --build-arg VITE_BASE_PATH=/paper-analyzer/ -t paper-analyzer:latest .
docker run -d --name paper-analyzer --restart unless-stopped \
  -e DATA_DIR=/data \
  -e WORKER_TOKEN=你的-worker-token \
  -v paper_analyzer_data:/data \
  -p 8787:8787 \
  paper-analyzer:latest
```

## MCP

PC Codex Agent 通过 Streamable HTTP 连接：

```text
http://服务器地址/paper-analyzer/mcp
```

请求需要携带：

```text
Authorization: Bearer <WORKER_TOKEN>
```

## 文档

- [PRD](docs/prd.md)
- [Question bank pipeline](docs/question-bank-pipeline-current.md)
