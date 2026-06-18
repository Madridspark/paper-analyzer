# Paper Analyzer

面向家长、老师和学生的试卷批改与个性化练习 MVP。

## 功能

- 首次打开自动进入 OpenAI API Key 配置页。
- 选择年级、学科和学生信息。
- 上传一张或多张试卷照片。
- 使用 GPT 多模态能力识别、批改并生成学习分析。
- 按薄弱知识点生成新的针对性练习试卷。
- 支持历史记录、答案解析和网页打印。

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

如果部署在路径前缀下，例如 `/paper-analyzer/`，构建时设置：

```bash
VITE_BASE_PATH=/paper-analyzer/ npm run build
```

## Docker

```bash
docker build --build-arg VITE_BASE_PATH=/paper-analyzer/ -t paper-analyzer:latest .
docker run -d --name paper-analyzer --restart unless-stopped -p 8787:8787 paper-analyzer:latest
```

## OpenAI Key

API Key 在页面内配置，保存在当前浏览器本地存储中。前端会把 key 随业务请求发送给本项目后端代理，后端只转发请求，不持久化保存。

默认模型是 `gpt-4.1-mini`，可在设置页调整。

## 文档

- [PRD](docs/prd.md)
