import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');
const tasksDir = path.join(dataDir, 'tasks');
const port = Number(process.env.PORT || 8787);
const workerToken = process.env.WORKER_TOKEN || '';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'task-center' });
});

app.get('/api/tasks', async (_req, res) => {
  const tasks = await listTasks();
  res.json({ tasks: tasks.map(toPublicTask) });
});

app.post('/api/tasks', async (req, res) => {
  const { grade, subject, studentName, practiceCount, difficulty, notes, images } = req.body ?? {};

  if (!grade || !subject) {
    return res.status(400).json({ message: '请选择年级和学科。' });
  }

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ message: '请至少上传一张试卷图片。' });
  }

  const task = await createTask({
    grade,
    subject,
    studentName,
    practiceCount,
    difficulty,
    notes,
    images
  });

  res.status(201).json({ task: toPublicTask(task) });
});

app.get('/api/tasks/:taskId', async (req, res) => {
  const task = await readTaskOrNull(req.params.taskId);
  if (!task) {
    return res.status(404).json({ message: '任务不存在。' });
  }
  res.json({ task: toPublicTask(task) });
});

app.get('/api/tasks/:taskId/images/:fileName', async (req, res) => {
  await sendTaskFile(req, res, 'images');
});

app.get('/api/tasks/:taskId/results/:fileName', async (req, res) => {
  await sendTaskFile(req, res, 'results');
});

app.post('/api/worker/tasks/:taskId/status', requireWorkerToken, async (req, res) => {
  const task = await updateTaskStatus(req.params.taskId, req.body?.status, req.body?.message);
  res.json({ task: toPublicTask(task) });
});

app.post('/api/worker/tasks/:taskId/results', requireWorkerToken, async (req, res) => {
  const { fileName, contentBase64, mimeType, kind, summary } = req.body ?? {};
  const result = await saveResultFile(req.params.taskId, {
    fileName,
    contentBase64,
    mimeType,
    kind,
    summary
  });
  res.status(201).json({ result });
});

app.all('/mcp', requireWorkerToken, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.use(express.static(distDir));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

await ensureDir(tasksDir);

app.listen(port, () => {
  console.log(`Paper Analyzer task center is running at http://localhost:${port}`);
  if (!workerToken) {
    console.warn('WORKER_TOKEN is not set. MCP and worker APIs are open; set WORKER_TOKEN before exposing publicly.');
  }
});

function createMcpServer() {
  const server = new McpServer({
    name: 'paper-analyzer-task-center',
    version: '0.1.0'
  });

  server.registerTool(
    'list_pending_tasks',
    {
      title: 'List pending paper tasks',
      description: 'List pending paper-analysis tasks waiting for a PC Codex agent.',
      inputSchema: {
        limit: z.number().int().min(1).max(20).default(5)
      }
    },
    async ({ limit }) => jsonToolResult(await listPendingTasks(limit))
  );

  server.registerTool(
    'claim_task',
    {
      title: 'Claim task',
      description: 'Claim one pending task before processing it. Returns the claimed task metadata and image URLs.',
      inputSchema: {
        taskId: z.string().min(1)
      }
    },
    async ({ taskId }) => jsonToolResult(toPublicTask(await claimTask(taskId)))
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get task',
      description: 'Read full metadata for a task, including image URLs and generated results.',
      inputSchema: {
        taskId: z.string().min(1)
      }
    },
    async ({ taskId }) => jsonToolResult(toPublicTask(await readTaskOrThrow(taskId)))
  );

  server.registerTool(
    'update_task_status',
    {
      title: 'Update task status',
      description: 'Update task status while the PC Codex agent processes it.',
      inputSchema: {
        taskId: z.string().min(1),
        status: z.enum(['processing', 'completed', 'failed']),
        message: z.string().optional()
      }
    },
    async ({ taskId, status, message }) => jsonToolResult(toPublicTask(await updateTaskStatus(taskId, status, message)))
  );

  server.registerTool(
    'upload_result_file',
    {
      title: 'Upload result file',
      description: 'Upload a generated report, practice paper, answer key, PDF, DOCX, or JSON summary for a task.',
      inputSchema: {
        taskId: z.string().min(1),
        fileName: z.string().min(1),
        contentBase64: z.string().min(1),
        mimeType: z.string().default('application/octet-stream'),
        kind: z.enum(['report', 'practice-paper', 'answer-key', 'summary', 'attachment']).default('attachment'),
        summary: z.string().optional()
      }
    },
    async (args) => jsonToolResult(await saveResultFile(args.taskId, args))
  );

  server.registerTool(
    'submit_task_result',
    {
      title: 'Submit task result',
      description: 'Mark a task completed after uploading all result files.',
      inputSchema: {
        taskId: z.string().min(1),
        summary: z.string().optional()
      }
    },
    async ({ taskId, summary }) => {
      const task = await updateTaskStatus(taskId, 'completed', summary || '处理完成');
      return jsonToolResult(toPublicTask(task));
    }
  );

  server.registerTool(
    'fail_task',
    {
      title: 'Fail task',
      description: 'Mark a task as failed and write the failure reason for the user.',
      inputSchema: {
        taskId: z.string().min(1),
        message: z.string().min(1)
      }
    },
    async ({ taskId, message }) => jsonToolResult(toPublicTask(await updateTaskStatus(taskId, 'failed', message)))
  );

  return server;
}

async function createTask(input) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const dir = taskDir(id);
  const imagesDir = path.join(dir, 'images');

  await ensureDir(imagesDir);
  await ensureDir(path.join(dir, 'results'));

  const savedImages = [];

  for (const [index, image] of input.images.entries()) {
    const parsed = parseDataUrl(image.dataUrl);
    const safeName = safeFileName(image.name || `page-${index + 1}`);
    const extension = extensionForMime(parsed.mimeType, safeName);
    const fileName = `${String(index + 1).padStart(2, '0')}-${stripExtension(safeName)}${extension}`;
    await fs.writeFile(path.join(imagesDir, fileName), parsed.buffer);
    savedImages.push({
      id: crypto.randomUUID(),
      name: image.name || fileName,
      fileName,
      mimeType: parsed.mimeType,
      url: `/api/tasks/${id}/images/${encodeURIComponent(fileName)}`
    });
  }

  const task = {
    id,
    status: 'pending',
    grade: String(input.grade),
    subject: String(input.subject),
    studentName: input.studentName ? String(input.studentName) : '',
    practiceCount: Number(input.practiceCount || 10),
    difficulty: input.difficulty ? String(input.difficulty) : '巩固',
    notes: input.notes ? String(input.notes) : '',
    images: savedImages,
    results: [],
    statusMessage: '等待 PC Codex Agent 处理',
    createdAt: now,
    updatedAt: now
  };

  await writeTask(task);
  return task;
}

async function listTasks() {
  await ensureDir(tasksDir);
  const ids = await fs.readdir(tasksDir);
  const tasks = await Promise.all(ids.map((id) => readTaskOrNull(id)));
  return tasks
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function listPendingTasks(limit = 5) {
  const tasks = await listTasks();
  return tasks.filter((task) => task.status === 'pending').slice(0, limit).map(toPublicTask);
}

async function claimTask(taskId) {
  const task = await readTaskOrThrow(taskId);
  if (task.status !== 'pending') {
    throw new Error(`任务当前状态为 ${task.status}，不能 claim。`);
  }
  const now = new Date().toISOString();
  task.status = 'claimed';
  task.statusMessage = 'PC Codex Agent 已领取任务';
  task.claimedAt = now;
  task.updatedAt = now;
  await writeTask(task);
  return task;
}

async function updateTaskStatus(taskId, status, message = '') {
  if (!['processing', 'completed', 'failed'].includes(status)) {
    throw new Error('不支持的任务状态。');
  }

  const task = await readTaskOrThrow(taskId);
  const now = new Date().toISOString();
  task.status = status;
  task.statusMessage = message || defaultStatusMessage(status);
  task.updatedAt = now;

  if (status === 'completed') {
    task.completedAt = now;
  }

  if (status === 'failed') {
    task.failedAt = now;
  }

  await writeTask(task);
  return task;
}

async function saveResultFile(taskId, input) {
  const task = await readTaskOrThrow(taskId);

  if (!input.fileName || !input.contentBase64) {
    throw new Error('缺少结果文件名或内容。');
  }

  const fileName = safeFileName(input.fileName);
  const buffer = Buffer.from(input.contentBase64, 'base64');
  const resultsDir = path.join(taskDir(taskId), 'results');
  await ensureDir(resultsDir);
  await fs.writeFile(path.join(resultsDir, fileName), buffer);

  const result = {
    id: crypto.randomUUID(),
    kind: input.kind || 'attachment',
    name: fileName,
    fileName,
    mimeType: input.mimeType || 'application/octet-stream',
    summary: input.summary || '',
    url: `/api/tasks/${taskId}/results/${encodeURIComponent(fileName)}`,
    createdAt: new Date().toISOString()
  };

  task.results = [...(task.results || []).filter((item) => item.fileName !== fileName), result];
  task.updatedAt = new Date().toISOString();
  task.statusMessage = input.summary || task.statusMessage;
  await writeTask(task);
  return result;
}

async function readTaskOrNull(taskId) {
  try {
    return JSON.parse(await fs.readFile(taskMetaPath(taskId), 'utf8'));
  } catch {
    return null;
  }
}

async function readTaskOrThrow(taskId) {
  const task = await readTaskOrNull(taskId);
  if (!task) {
    throw new Error('任务不存在。');
  }
  return task;
}

async function writeTask(task) {
  await ensureDir(taskDir(task.id));
  await fs.writeFile(taskMetaPath(task.id), JSON.stringify(task, null, 2));
}

async function sendTaskFile(req, res, folderName) {
  const task = await readTaskOrNull(req.params.taskId);
  if (!task) {
    return res.status(404).json({ message: '任务不存在。' });
  }

  const fileName = safeFileName(req.params.fileName);
  const filePath = path.join(taskDir(task.id), folderName, fileName);
  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ message: '文件不存在。' });
    }
  });
}

function toPublicTask(task) {
  return {
    id: task.id,
    status: task.status,
    statusMessage: task.statusMessage,
    grade: task.grade,
    subject: task.subject,
    studentName: task.studentName,
    practiceCount: task.practiceCount,
    difficulty: task.difficulty,
    notes: task.notes,
    images: task.images,
    results: task.results || [],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    claimedAt: task.claimedAt,
    completedAt: task.completedAt,
    failedAt: task.failedAt
  };
}

function requireWorkerToken(req, res, next) {
  if (!workerToken) {
    return next();
  }

  const raw = req.header('authorization') || req.header('x-worker-token') || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (token !== workerToken) {
    return res.status(401).json({ message: 'Worker token 无效。' });
  }
  next();
}

function jsonToolResult(value) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function parseDataUrl(value = '') {
  const match = /^data:(.*?);base64,(.*)$/u.exec(value);
  if (!match) {
    throw new Error('图片数据格式无效。');
  }
  return {
    mimeType: match[1] || 'application/octet-stream',
    buffer: Buffer.from(match[2], 'base64')
  };
}

function extensionForMime(mimeType, fileName) {
  const existing = path.extname(fileName);
  if (existing) {
    return existing;
  }

  const byMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'application/pdf': '.pdf',
    'text/markdown': '.md',
    'application/json': '.json'
  };

  return byMime[mimeType] || '.bin';
}

function stripExtension(fileName) {
  return fileName.replace(/\.[a-z0-9]+$/iu, '');
}

function safeFileName(value) {
  const cleaned = String(value)
    .replace(/[\\/:\0]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/gu, '')
    .slice(0, 120);
  return cleaned || `file-${Date.now()}`;
}

function defaultStatusMessage(status) {
  return {
    processing: 'PC Codex Agent 正在处理',
    completed: '处理完成',
    failed: '处理失败'
  }[status];
}

function taskDir(taskId) {
  return path.join(tasksDir, safeFileName(taskId));
}

function taskMetaPath(taskId) {
  return path.join(taskDir(taskId), 'task.json');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
