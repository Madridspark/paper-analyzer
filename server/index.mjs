import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || 8787);
const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

const app = express();

app.use(express.json({ limit: '30mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const apiKey = readApiKey(req);
    const { grade, subject, studentName, images, model } = req.body ?? {};

    if (!apiKey) {
      return res.status(401).json({ message: '请先在设置页配置 OpenAI API Key。' });
    }

    if (!grade || !subject) {
      return res.status(400).json({ message: '请选择年级和学科。' });
    }

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: '请至少上传一张试卷图片。' });
    }

    const response = await callOpenAI({
      apiKey,
      model,
      schemaName: 'paper_analysis',
      schema: paperAnalysisSchema,
      content: [
        {
          type: 'input_text',
          text: buildAnalyzePrompt({ grade, subject, studentName })
        },
        ...images.map((image) => ({
          type: 'input_image',
          image_url: image.dataUrl,
          detail: 'auto'
        }))
      ]
    });

    res.json({
      report: response,
      analyzedAt: new Date().toISOString()
    });
  } catch (error) {
    handleError(error, res);
  }
});

app.post('/api/generate-practice', async (req, res) => {
  try {
    const apiKey = readApiKey(req);
    const { grade, subject, report, selectedKnowledgePoints, count, difficulty, questionTypes, model } = req.body ?? {};

    if (!apiKey) {
      return res.status(401).json({ message: '请先在设置页配置 OpenAI API Key。' });
    }

    if (!grade || !subject || !report) {
      return res.status(400).json({ message: '缺少生成试卷所需的分析报告。' });
    }

    const response = await callOpenAI({
      apiKey,
      model,
      schemaName: 'generated_practice_paper',
      schema: generatedPaperSchema,
      content: [
        {
          type: 'input_text',
          text: buildGeneratePrompt({
            grade,
            subject,
            report,
            selectedKnowledgePoints,
            count,
            difficulty,
            questionTypes
          })
        }
      ]
    });

    res.json({
      paper: response,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleError(error, res);
  }
});

app.use(express.static(distDir));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Paper Analyzer is running at http://localhost:${port}`);
});

function readApiKey(req) {
  const rawHeader = req.header('x-openai-api-key') || '';
  const headerValue = rawHeader.replace(/^Bearer\s+/i, '').trim();
  return headerValue || process.env.OPENAI_API_KEY || '';
}

async function callOpenAI({ apiKey, model, schemaName, schema, content }) {
  const response = await fetch(`${openaiBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || `OpenAI 请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error('OpenAI 未返回可解析的结构化结果。');
  }

  try {
    return JSON.parse(outputText);
  } catch {
    throw new Error('OpenAI 返回内容不是合法 JSON。');
  }
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string') {
    return data.output_text;
  }

  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === 'string') {
        return content.text;
      }
    }
  }

  return '';
}

function handleError(error, res) {
  const status = Number(error?.status || 500);
  const message = error?.message || '服务暂时不可用，请稍后重试。';
  res.status(status >= 400 && status < 600 ? status : 500).json({ message });
}

function buildAnalyzePrompt({ grade, subject, studentName }) {
  return [
    '你是严谨的中小学试卷批改老师和学习诊断专家。',
    `年级：${grade}`,
    `学科：${subject}`,
    `学生：${studentName || '未填写'}`,
    '请根据上传的试卷图片完成识别、批改和分析。',
    '优先识别题号、题干、学生答案、分值、标准答案、得分、知识点、错因和解析。',
    '如果图片中没有标准答案，请基于题目自行推导标准答案。',
    '如果无法确定学生答案或判分，请把 gradingStatus 标为 unable，并降低 confidence。',
    '不要编造看不清的题目内容；看不清时保留“无法识别”。',
    '分数可以估算，但必须与每题表现一致。',
    '输出必须严格符合 JSON Schema。'
  ].join('\n');
}

function buildGeneratePrompt({ grade, subject, report, selectedKnowledgePoints, count, difficulty, questionTypes }) {
  return [
    '你是中小学教研老师，请根据学生试卷分析生成一份针对性练习。',
    `年级：${grade}`,
    `学科：${subject}`,
    `目标知识点：${formatList(selectedKnowledgePoints) || '根据报告自动选择薄弱点'}`,
    `题目数量：${count || 8}`,
    `难度：${difficulty || '巩固'}`,
    `题型：${formatList(questionTypes) || '根据学科自动搭配'}`,
    '要求：不要直接复制原试卷题目原文；题目要适合该年级；每道题必须包含答案、解析和对应知识点。',
    '以下是学生本次试卷分析报告：',
    JSON.stringify(report),
    '输出必须严格符合 JSON Schema。'
  ].join('\n');
}

function formatList(value) {
  return Array.isArray(value) ? value.filter(Boolean).join('、') : '';
}

const paperAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['paperTitle', 'summary', 'questions', 'knowledgePoints', 'errorTags', 'recommendations'],
  properties: {
    paperTitle: { type: 'string' },
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['totalScore', 'studentScore', 'accuracy', 'comment'],
      properties: {
        totalScore: { type: 'number' },
        studentScore: { type: 'number' },
        accuracy: { type: 'number' },
        comment: { type: 'string' }
      }
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'number',
          'type',
          'stem',
          'studentAnswer',
          'standardAnswer',
          'gradingStatus',
          'score',
          'studentScore',
          'knowledgePoints',
          'errorTags',
          'explanation',
          'confidence'
        ],
        properties: {
          number: { type: 'string' },
          type: { type: 'string' },
          stem: { type: 'string' },
          studentAnswer: { type: 'string' },
          standardAnswer: { type: 'string' },
          gradingStatus: {
            type: 'string',
            enum: ['correct', 'wrong', 'partial', 'unable']
          },
          score: { type: 'number' },
          studentScore: { type: 'number' },
          knowledgePoints: {
            type: 'array',
            items: { type: 'string' }
          },
          errorTags: {
            type: 'array',
            items: { type: 'string' }
          },
          explanation: { type: 'string' },
          confidence: { type: 'number' }
        }
      }
    },
    knowledgePoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'status', 'wrongCount', 'suggestion'],
        properties: {
          name: { type: 'string' },
          status: {
            type: 'string',
            enum: ['mastered', 'practice', 'weak']
          },
          wrongCount: { type: 'number' },
          suggestion: { type: 'string' }
        }
      }
    },
    errorTags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'count'],
        properties: {
          name: { type: 'string' },
          count: { type: 'number' }
        }
      }
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' }
    }
  }
};

const generatedPaperSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'questions', 'answerKey'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'type', 'stem', 'score', 'knowledgePoint', 'answer', 'explanation'],
        properties: {
          number: { type: 'string' },
          type: { type: 'string' },
          stem: { type: 'string' },
          score: { type: 'number' },
          knowledgePoint: { type: 'string' },
          answer: { type: 'string' },
          explanation: { type: 'string' }
        }
      }
    },
    answerKey: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'answer', 'explanation'],
        properties: {
          number: { type: 'string' },
          answer: { type: 'string' },
          explanation: { type: 'string' }
        }
      }
    }
  }
};
