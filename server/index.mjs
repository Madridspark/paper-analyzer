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
const catalogPath = path.join(rootDir, 'src/data/academic-catalog.json');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');
const filesDir = path.join(dataDir, 'files');
const dbPath = path.join(dataDir, 'db.json');
const port = Number(process.env.PORT || 8787);
const workerToken = process.env.WORKER_TOKEN || '';
const ownerId = 'default';

const app = express();

app.use(express.json({ limit: '80mb' }));

const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));

await ensureDir(filesDir);
await ensureDb();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'task-center' });
});

app.get('/api/catalog', async (_req, res) => {
  const db = await readDb();
  res.json({
    catalog,
    questionTypes: db.questionTypes,
    paperTemplates: db.paperTemplates,
    knowledgePoints: db.knowledgePoints
  });
});

app.get('/api/students', async (_req, res) => {
  const db = await readDb();
  res.json({ students: db.students.sort(byUpdatedDesc) });
});

app.post('/api/students', async (req, res) => {
  const db = await readDb();
  const student = upsertStudent(db, req.body?.name, req.body?.currentGrade, req.body?.notes);
  await writeDb(db);
  res.status(201).json({ student });
});

app.get('/api/students/:studentId', async (req, res) => {
  const db = await readDb();
  const student = db.students.find((item) => item.id === req.params.studentId);
  if (!student) {
    return res.status(404).json({ message: '学生不存在。' });
  }
  res.json({
    student,
    submissions: db.submissions.filter((item) => item.studentId === student.id).sort(byCreatedDesc),
    practiceTasks: db.practiceTasks.filter((item) => item.studentIds.includes(student.id)).sort(byCreatedDesc)
  });
});

app.patch('/api/students/:studentId', async (req, res) => {
  const db = await readDb();
  const student = db.students.find((item) => item.id === req.params.studentId);
  if (!student) {
    return res.status(404).json({ message: '学生不存在。' });
  }

  const nextName = req.body?.name?.trim();
  if (nextName && nextName !== student.name && db.students.some((item) => item.name === nextName)) {
    return res.status(409).json({ message: '学生姓名不能重复。' });
  }

  Object.assign(student, {
    name: nextName || student.name,
    currentGrade: req.body?.currentGrade || student.currentGrade,
    notes: req.body?.notes ?? student.notes,
    profileSummary: req.body?.profileSummary ?? student.profileSummary,
    strengths: Array.isArray(req.body?.strengths) ? req.body.strengths : student.strengths,
    weaknesses: Array.isArray(req.body?.weaknesses) ? req.body.weaknesses : student.weaknesses,
    trendSummary: req.body?.trendSummary ?? student.trendSummary,
    updatedAt: now()
  });

  await writeDb(db);
  res.json({ student });
});

app.get('/api/submissions', async (req, res) => {
  const db = await readDb();
  const studentId = req.query.studentId?.toString();
  const submissions = db.submissions
    .filter((item) => !studentId || item.studentId === studentId)
    .sort(byCreatedDesc);
  res.json({ submissions: submissions.map((item) => expandSubmission(db, item)) });
});

app.post('/api/upload-batches', async (req, res) => {
  const db = await readDb();
  const inputStudents = Array.isArray(req.body?.students) ? req.body.students : [];

  if (inputStudents.length === 0) {
    return res.status(400).json({ message: '请至少添加一个学生。' });
  }

  const batch = {
    id: makeId('batch'),
    ownerId,
    title: req.body?.title || `上传批次 ${new Date().toLocaleString('zh-CN')}`,
    studentIds: [],
    submissionIds: [],
    createdAt: now()
  };

  for (const studentInput of inputStudents) {
    const submissions = Array.isArray(studentInput.submissions) ? studentInput.submissions : [];
    if (!studentInput.name || submissions.length === 0) {
      continue;
    }

    const firstGrade = submissions.find((item) => item.grade)?.grade || '';
    const student = upsertStudent(db, studentInput.name, firstGrade, studentInput.notes);
    batch.studentIds.push(student.id);

    for (const submissionInput of submissions) {
      if (!submissionInput.grade || !submissionInput.subject) {
        continue;
      }
      const images = Array.isArray(submissionInput.images) ? submissionInput.images : [];
      if (images.length === 0) {
        continue;
      }

      if (isHigherGrade(submissionInput.grade, student.currentGrade)) {
        student.currentGrade = submissionInput.grade;
        student.updatedAt = now();
      }

      const fileIds = [];
      for (const [index, image] of images.entries()) {
        fileIds.push(await saveDataUrlFile(db, {
          dataUrl: image.dataUrl,
          name: image.name || `page-${index + 1}.jpg`,
          scope: 'submission-image'
        }));
      }

      const submission = {
        id: makeId('sub'),
        ownerId,
        studentId: student.id,
        studentNameSnapshot: student.name,
        grade: submissionInput.grade,
        subject: submissionInput.subject,
        notes: submissionInput.notes || '',
        requestPracticeSuggestion: Boolean(submissionInput.requestPracticeSuggestion ?? true),
        imageIds: fileIds,
        sourceBatchId: batch.id,
        analysisStatus: 'pending',
        analysisResult: null,
        layoutSnapshot: null,
        recommendedPracticePlan: null,
        createdAt: now(),
        updatedAt: now()
      };
      db.submissions.push(submission);
      batch.submissionIds.push(submission.id);
    }
  }

  if (batch.submissionIds.length === 0) {
    return res.status(400).json({ message: '每个作答需要年级、学科和图片。' });
  }

  const analysisTask = {
    id: makeId('analysis'),
    ownerId,
    taskType: 'analysis',
    status: 'pending',
    statusMessage: '等待 PC Codex Agent 分析',
    batchId: batch.id,
    submissionIds: batch.submissionIds,
    resultSummary: '',
    createdAt: now(),
    updatedAt: now()
  };

  db.uploadBatches.push(batch);
  db.analysisTasks.push(analysisTask);
  await writeDb(db);
  res.status(201).json({ batch, analysisTask, submissions: batch.submissionIds });
});

app.get('/api/analysis-tasks', async (_req, res) => {
  const db = await readDb();
  res.json({ tasks: db.analysisTasks.sort(byCreatedDesc).map((task) => expandAnalysisTask(db, task)) });
});

app.get('/api/analysis-tasks/:taskId', async (req, res) => {
  const db = await readDb();
  const task = db.analysisTasks.find((item) => item.id === req.params.taskId);
  if (!task) {
    return res.status(404).json({ message: '分析任务不存在。' });
  }
  res.json({ task: expandAnalysisTask(db, task) });
});

app.get('/api/practice-tasks', async (_req, res) => {
  const db = await readDb();
  res.json({ tasks: db.practiceTasks.sort(byCreatedDesc).map((task) => expandPracticeTask(db, task)) });
});

app.post('/api/practice-tasks', async (req, res) => {
  const db = await readDb();
  const tasks = createPracticeTasks(db, req.body ?? {});
  await writeDb(db);
  res.status(201).json({ tasks });
});

app.get('/api/practice-tasks/:taskId', async (req, res) => {
  const db = await readDb();
  const task = db.practiceTasks.find((item) => item.id === req.params.taskId);
  if (!task) {
    return res.status(404).json({ message: '出卷任务不存在。' });
  }
  res.json({ task: expandPracticeTask(db, task) });
});

app.get('/api/question-types', async (_req, res) => {
  const db = await readDb();
  res.json({ questionTypes: db.questionTypes });
});

app.post('/api/question-types', async (req, res) => {
  const db = await readDb();
  const questionType = {
    id: makeId('qt'),
    ownerId,
    subject: req.body?.subject,
    name: req.body?.name,
    description: req.body?.description || '',
    isSystem: false,
    isActive: true,
    createdAt: now(),
    updatedAt: now()
  };
  if (!questionType.subject || !questionType.name) {
    return res.status(400).json({ message: '请填写学科和题型名称。' });
  }
  db.questionTypes.push(questionType);
  await writeDb(db);
  res.status(201).json({ questionType });
});

app.patch('/api/question-types/:id', async (req, res) => {
  const db = await readDb();
  const questionType = db.questionTypes.find((item) => item.id === req.params.id);
  if (!questionType) {
    return res.status(404).json({ message: '题型不存在。' });
  }
  Object.assign(questionType, {
    subject: req.body?.subject || questionType.subject,
    name: req.body?.name || questionType.name,
    description: req.body?.description ?? questionType.description,
    isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : questionType.isActive,
    updatedAt: now()
  });
  await writeDb(db);
  res.json({ questionType });
});

app.get('/api/paper-templates', async (_req, res) => {
  const db = await readDb();
  res.json({ paperTemplates: db.paperTemplates });
});

app.post('/api/paper-templates', async (req, res) => {
  const db = await readDb();
  const template = normalizeTemplate(req.body);
  db.paperTemplates.push(template);
  await writeDb(db);
  res.status(201).json({ paperTemplate: template });
});

app.patch('/api/paper-templates/:id', async (req, res) => {
  const db = await readDb();
  const index = db.paperTemplates.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: '模板不存在。' });
  }
  db.paperTemplates[index] = {
    ...db.paperTemplates[index],
    ...normalizeTemplate({ ...db.paperTemplates[index], ...req.body }, db.paperTemplates[index].id),
    updatedAt: now()
  };
  await writeDb(db);
  res.json({ paperTemplate: db.paperTemplates[index] });
});

app.get('/api/files/:fileId', async (req, res) => {
  const db = await readDb();
  const file = db.files.find((item) => item.id === req.params.fileId);
  if (!file) {
    return res.status(404).json({ message: '文件不存在。' });
  }
  res.type(file.mimeType || 'application/octet-stream');
  res.sendFile(path.join(filesDir, file.storedName));
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

app.listen(port, () => {
  console.log(`Paper Analyzer task center is running at http://localhost:${port}`);
  if (!workerToken) {
    console.warn('WORKER_TOKEN is not set. MCP and worker APIs are open; set WORKER_TOKEN before exposing publicly.');
  }
});

function createMcpServer() {
  const server = new McpServer({
    name: 'paper-analyzer-task-center',
    version: '0.2.0'
  });

  server.registerTool(
    'list_pending_tasks',
    {
      title: 'List pending tasks',
      description: 'List pending analysis or practice-generation tasks.',
      inputSchema: {
        taskType: z.enum(['analysis', 'practice-generation']).optional(),
        limit: z.number().int().min(1).max(20).default(5)
      }
    },
    async ({ taskType, limit }) => jsonToolResult(await listPendingTasks(taskType, limit))
  );

  server.registerTool(
    'claim_task',
    {
      title: 'Claim task',
      description: 'Claim a pending task before processing it.',
      inputSchema: { taskId: z.string().min(1) }
    },
    async ({ taskId }) => jsonToolResult(await claimTask(taskId))
  );

  server.registerTool(
    'get_analysis_task',
    {
      title: 'Get analysis task',
      description: 'Get complete input for an analysis task.',
      inputSchema: { taskId: z.string().min(1) }
    },
    async ({ taskId }) => {
      const db = await readDb();
      const task = getTaskOrThrow(db, taskId, 'analysis');
      return jsonToolResult(expandAnalysisTask(db, task, true));
    }
  );

  server.registerTool(
    'submit_analysis_result',
    {
      title: 'Submit analysis result',
      description: 'Submit structured analysis results, profile patches, and knowledge point suggestions.',
      inputSchema: {
        taskId: z.string().min(1),
        submissionResults: z.array(z.record(z.string(), z.unknown())).default([]),
        studentProfilePatches: z.array(z.record(z.string(), z.unknown())).default([]),
        knowledgePointSuggestions: z.array(z.record(z.string(), z.unknown())).default([]),
        summary: z.string().optional()
      }
    },
    async (args) => jsonToolResult(await submitAnalysisResult(args))
  );

  server.registerTool(
    'get_practice_task',
    {
      title: 'Get practice task',
      description: 'Get complete input for a practice-generation task.',
      inputSchema: { taskId: z.string().min(1) }
    },
    async ({ taskId }) => {
      const db = await readDb();
      const task = getTaskOrThrow(db, taskId, 'practice-generation');
      return jsonToolResult(expandPracticeTask(db, task, true));
    }
  );

  server.registerTool(
    'upload_result_file',
    {
      title: 'Upload result file',
      description: 'Upload generated report, practice paper, answer key, PDF, DOCX, or JSON result.',
      inputSchema: {
        taskId: z.string().min(1),
        fileName: z.string().min(1),
        contentBase64: z.string().min(1),
        mimeType: z.string().default('application/octet-stream'),
        kind: z.enum(['report', 'practice-paper', 'answer-key', 'summary', 'attachment']).default('attachment'),
        summary: z.string().optional()
      }
    },
    async (args) => jsonToolResult(await uploadResultFile(args))
  );

  server.registerTool(
    'submit_practice_result',
    {
      title: 'Submit practice result',
      description: 'Submit structured practice-generation result and mark task completed.',
      inputSchema: {
        taskId: z.string().min(1),
        result: z.record(z.string(), z.unknown()).default({}),
        summary: z.string().optional()
      }
    },
    async ({ taskId, result, summary }) => jsonToolResult(await completePracticeTask(taskId, result, summary))
  );

  server.registerTool(
    'fail_task',
    {
      title: 'Fail task',
      description: 'Mark a task as failed with a reason.',
      inputSchema: {
        taskId: z.string().min(1),
        message: z.string().min(1)
      }
    },
    async ({ taskId, message }) => jsonToolResult(await failTask(taskId, message))
  );

  return server;
}

async function ensureDb() {
  try {
    await fs.access(dbPath);
  } catch {
    const db = {
      version: 2,
      students: [],
      uploadBatches: [],
      submissions: [],
      analysisTasks: [],
      practiceTasks: [],
      questionTypes: seedQuestionTypes(),
      paperTemplates: seedPaperTemplates(),
      knowledgePoints: seedKnowledgePoints(),
      files: []
    };
    await writeDb(db);
  }
}

async function readDb() {
  await ensureDir(dataDir);
  return JSON.parse(await fs.readFile(dbPath, 'utf8'));
}

async function writeDb(db) {
  await ensureDir(dataDir);
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

function seedQuestionTypes() {
  return Object.entries(catalog.questionTypes).flatMap(([subject, types]) =>
    types.map((name) => ({
      id: makeId('qt'),
      ownerId,
      subject,
      name,
      description: '',
      isSystem: true,
      isActive: true,
      createdAt: now(),
      updatedAt: now()
    }))
  );
}

function seedPaperTemplates() {
  return catalog.paperTemplates.map((item) => normalizeTemplate({ ...item, isSystem: true }));
}

function seedKnowledgePoints() {
  return Object.entries(catalog.knowledgePoints).flatMap(([subject, groups]) =>
    groups.flatMap((group) =>
      group.items.map((name) => ({
        id: makeId('kp'),
        ownerId,
        subject,
        gradeRange: group.gradeRange,
        name,
        parentId: '',
        source: 'seed',
        isActive: true,
        createdAt: now(),
        updatedAt: now()
      }))
    )
  );
}

function normalizeTemplate(input, id = makeId('tpl')) {
  const sections = Array.isArray(input.sections) ? input.sections : [];
  return {
    id,
    ownerId,
    name: input.name || '未命名模板',
    subject: input.subject || '数学',
    gradeRange: Array.isArray(input.gradeRange) ? input.gradeRange : [],
    orientation: input.orientation === 'landscape' ? 'landscape' : 'portrait',
    sections: sections.map((section, index) => ({
      id: section.id || makeId('sec'),
      name: section.name || `模块 ${index + 1}`,
      questionTypeId: section.questionTypeId || '',
      questionTypeName: section.questionTypeName || section.type || '自定义题型',
      count: Number(section.count || 1),
      order: Number(section.order || index + 1),
      notes: section.notes || ''
    })),
    isSystem: Boolean(input.isSystem),
    isActive: typeof input.isActive === 'boolean' ? input.isActive : true,
    createdAt: input.createdAt || now(),
    updatedAt: now()
  };
}

function upsertStudent(db, rawName, currentGrade = '', notes = '') {
  const name = String(rawName || '').trim();
  if (!name) {
    throw new Error('学生姓名不能为空。');
  }

  let student = db.students.find((item) => item.name === name);
  if (!student) {
    student = {
      id: makeId('stu'),
      ownerId,
      name,
      currentGrade: currentGrade || '',
      notes: notes || '',
      profileSummary: '',
      strengths: [],
      weaknesses: [],
      trendSummary: '',
      createdAt: now(),
      updatedAt: now()
    };
    db.students.push(student);
  } else {
    if (currentGrade && isHigherGrade(currentGrade, student.currentGrade)) {
      student.currentGrade = currentGrade;
    }
    if (notes) {
      student.notes = notes;
    }
    student.updatedAt = now();
  }
  return student;
}

function createPracticeTasks(db, input) {
  const mode = input.mode || 'blank';
  const studentIds = Array.isArray(input.studentIds) ? input.studentIds : [];
  const submissionIds = Array.isArray(input.submissionIds) ? input.submissionIds : [];
  const isBatchPersonal = mode === 'batch-student';
  const targets = isBatchPersonal && studentIds.length ? studentIds.map((studentId) => ({ studentIds: [studentId] })) : [{ studentIds }];

  const tasks = targets.map((target) => {
    const task = {
      id: makeId('practice'),
      ownerId,
      taskType: 'practice-generation',
      status: 'pending',
      statusMessage: '等待 PC Codex Agent 出卷',
      mode,
      studentIds: target.studentIds,
      submissionIds,
      templateId: input.templateId || '',
      subject: input.subject || '',
      grade: input.grade || '',
      layout: input.layout || null,
      knowledgePointIds: Array.isArray(input.knowledgePointIds) ? input.knowledgePointIds : [],
      requirements: input.requirements || '',
      result: null,
      resultFileIds: [],
      createdAt: now(),
      updatedAt: now()
    };
    db.practiceTasks.push(task);
    return expandPracticeTask(db, task);
  });

  return tasks;
}

async function listPendingTasks(taskType, limit = 5) {
  const db = await readDb();
  const tasks = [...db.analysisTasks, ...db.practiceTasks]
    .filter((task) => task.status === 'pending')
    .filter((task) => !taskType || task.taskType === taskType)
    .sort(byCreatedAsc)
    .slice(0, limit)
    .map((task) => ({
      id: task.id,
      taskType: task.taskType,
      status: task.status,
      statusMessage: task.statusMessage,
      submissionCount: task.submissionIds?.length || 0,
      createdAt: task.createdAt
    }));
  return tasks;
}

async function claimTask(taskId) {
  const db = await readDb();
  const task = getTaskOrThrow(db, taskId);
  if (task.status !== 'pending') {
    throw new Error(`任务当前状态为 ${task.status}，不能领取。`);
  }
  Object.assign(task, {
    status: 'claimed',
    statusMessage: 'PC Codex Agent 已领取',
    claimedAt: now(),
    updatedAt: now()
  });
  await writeDb(db);
  return publicTask(task);
}

async function submitAnalysisResult(input) {
  const db = await readDb();
  const task = getTaskOrThrow(db, input.taskId, 'analysis');

  for (const item of input.submissionResults || []) {
    const submission = db.submissions.find((target) => target.id === item.submissionId);
    if (!submission) {
      continue;
    }
    submission.analysisStatus = 'completed';
    submission.analysisResult = item.analysisResult || {};
    submission.layoutSnapshot = item.layoutSnapshot || null;
    submission.recommendedPracticePlan = item.recommendedPracticePlan || null;
    submission.updatedAt = now();
  }

  for (const patch of input.studentProfilePatches || []) {
    const student = db.students.find((item) => item.id === patch.studentId);
    if (!student) {
      continue;
    }
    if (patch.currentGrade && isHigherGrade(patch.currentGrade, student.currentGrade)) {
      student.currentGrade = patch.currentGrade;
    }
    student.profileSummary = patch.profileSummary || student.profileSummary;
    student.strengths = Array.isArray(patch.strengths) ? patch.strengths : student.strengths;
    student.weaknesses = Array.isArray(patch.weaknesses) ? patch.weaknesses : student.weaknesses;
    student.trendSummary = patch.trendSummary || student.trendSummary;
    student.updatedAt = now();
  }

  for (const suggestion of input.knowledgePointSuggestions || []) {
    if (!suggestion.subject || !suggestion.name) {
      continue;
    }
    const exists = db.knowledgePoints.some(
      (item) => item.subject === suggestion.subject && item.name === suggestion.name
    );
    if (!exists) {
      db.knowledgePoints.push({
        id: makeId('kp'),
        ownerId,
        subject: suggestion.subject,
        gradeRange: Array.isArray(suggestion.gradeRange) ? suggestion.gradeRange : [],
        name: suggestion.name,
        parentId: '',
        source: 'agent',
        isActive: true,
        createdAt: now(),
        updatedAt: now()
      });
    }
  }

  Object.assign(task, {
    status: 'completed',
    statusMessage: input.summary || '分析完成',
    resultSummary: input.summary || '',
    completedAt: now(),
    updatedAt: now()
  });
  await writeDb(db);
  return expandAnalysisTask(db, task);
}

async function uploadResultFile(input) {
  const db = await readDb();
  const task = getTaskOrThrow(db, input.taskId);
  const fileId = await saveBase64File(db, {
    contentBase64: input.contentBase64,
    name: input.fileName,
    mimeType: input.mimeType,
    scope: 'result'
  });
  const file = db.files.find((item) => item.id === fileId);
  file.kind = input.kind || 'attachment';
  file.summary = input.summary || '';
  file.taskId = task.id;

  if (task.taskType === 'practice-generation') {
    task.resultFileIds = [...new Set([...(task.resultFileIds || []), fileId])];
  }
  task.updatedAt = now();
  await writeDb(db);
  return publicFile(file);
}

async function completePracticeTask(taskId, result, summary) {
  const db = await readDb();
  const task = getTaskOrThrow(db, taskId, 'practice-generation');
  Object.assign(task, {
    status: 'completed',
    statusMessage: summary || '出卷完成',
    result: result || {},
    completedAt: now(),
    updatedAt: now()
  });
  await writeDb(db);
  return expandPracticeTask(db, task);
}

async function failTask(taskId, message) {
  const db = await readDb();
  const task = getTaskOrThrow(db, taskId);
  Object.assign(task, {
    status: 'failed',
    statusMessage: message,
    failedAt: now(),
    updatedAt: now()
  });
  await writeDb(db);
  return publicTask(task);
}

async function saveDataUrlFile(db, input) {
  const match = /^data:(.*?);base64,(.*)$/u.exec(input.dataUrl || '');
  if (!match) {
    throw new Error('图片数据格式无效。');
  }
  return saveBase64File(db, {
    contentBase64: match[2],
    mimeType: match[1] || 'application/octet-stream',
    name: input.name,
    scope: input.scope
  });
}

async function saveBase64File(db, input) {
  const id = makeId('file');
  const fileName = safeFileName(input.name || id);
  const extension = path.extname(fileName) || extensionForMime(input.mimeType);
  const storedName = `${id}${extension}`;
  await fs.writeFile(path.join(filesDir, storedName), Buffer.from(input.contentBase64, 'base64'));
  const file = {
    id,
    ownerId,
    name: fileName,
    storedName,
    mimeType: input.mimeType || 'application/octet-stream',
    scope: input.scope || 'attachment',
    url: `/api/files/${id}`,
    createdAt: now()
  };
  db.files.push(file);
  return id;
}

function getTaskOrThrow(db, taskId, taskType) {
  const task = [...db.analysisTasks, ...db.practiceTasks].find((item) => item.id === taskId);
  if (!task || (taskType && task.taskType !== taskType)) {
    throw new Error('任务不存在。');
  }
  return task;
}

function expandAnalysisTask(db, task, includeContext = false) {
  const submissions = task.submissionIds.map((id) => expandSubmission(db, db.submissions.find((item) => item.id === id))).filter(Boolean);
  const result = {
    ...publicTask(task),
    batch: db.uploadBatches.find((item) => item.id === task.batchId) || null,
    submissions
  };
  if (includeContext) {
    result.context = {
      students: submissions.map((item) => item.student),
      questionTypes: db.questionTypes.filter((item) => item.isActive),
      paperTemplates: db.paperTemplates.filter((item) => item.isActive),
      knowledgePoints: db.knowledgePoints.filter((item) => item.isActive),
      textbookVersions: catalog.textbookVersions
    };
  }
  return result;
}

function expandPracticeTask(db, task, includeContext = false) {
  const resultFiles = (task.resultFileIds || []).map((id) => db.files.find((file) => file.id === id)).filter(Boolean).map(publicFile);
  const result = {
    ...publicTask(task),
    students: task.studentIds.map((id) => db.students.find((student) => student.id === id)).filter(Boolean),
    submissions: task.submissionIds.map((id) => expandSubmission(db, db.submissions.find((item) => item.id === id))).filter(Boolean),
    template: db.paperTemplates.find((item) => item.id === task.templateId) || null,
    resultFiles
  };
  if (includeContext) {
    result.context = {
      questionTypes: db.questionTypes.filter((item) => item.isActive),
      knowledgePoints: db.knowledgePoints.filter((item) => item.isActive),
      textbookVersions: catalog.textbookVersions
    };
  }
  return result;
}

function expandSubmission(db, submission) {
  if (!submission) {
    return null;
  }
  const student = db.students.find((item) => item.id === submission.studentId);
  return {
    ...submission,
    student,
    images: submission.imageIds.map((id) => db.files.find((file) => file.id === id)).filter(Boolean).map(publicFile)
  };
}

function publicTask(task) {
  return {
    ...task
  };
}

function publicFile(file) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    kind: file.kind || file.scope,
    summary: file.summary || '',
    url: file.url,
    createdAt: file.createdAt
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

function isHigherGrade(nextGrade, currentGrade) {
  const nextIndex = catalog.grades.indexOf(nextGrade);
  const currentIndex = catalog.grades.indexOf(currentGrade);
  return nextIndex >= 0 && nextIndex > currentIndex;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/gu, '').slice(0, 12)}`;
}

function now() {
  return new Date().toISOString();
}

function byCreatedDesc(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function byCreatedAsc(a, b) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function byUpdatedDesc(a, b) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function safeFileName(value) {
  return String(value)
    .replace(/[\\/:\0]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/gu, '')
    .slice(0, 120) || `file-${Date.now()}`;
}

function extensionForMime(mimeType = '') {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/markdown': '.md',
    'application/json': '.json'
  };
  return map[mimeType] || '.bin';
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
