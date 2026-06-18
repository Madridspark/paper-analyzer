import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  HistoryOutlined,
  KeyOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SettingOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Divider,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Steps,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import type {
  AnalyzedQuestion,
  GeneratedPaper,
  HistoryItem,
  KnowledgePointStat,
  PaperAnalysis,
  StoredSettings,
  UploadedImage
} from './types';

const { Title, Text, Paragraph } = Typography;

const settingsKey = 'paper-analyzer-settings';
const historyKey = 'paper-analyzer-history';
const apiBaseUrl = import.meta.env.BASE_URL;

const defaultSettings: StoredSettings = {
  apiKey: '',
  model: 'gpt-4.1-mini'
};

const gradeOptions = [
  '小学一年级',
  '小学二年级',
  '小学三年级',
  '小学四年级',
  '小学五年级',
  '小学六年级',
  '初中一年级',
  '初中二年级',
  '初中三年级',
  '高中一年级',
  '高中二年级',
  '高中三年级'
];

const subjectOptions = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];

const statusLabel = {
  correct: { text: '正确', color: 'success' },
  wrong: { text: '错误', color: 'error' },
  partial: { text: '部分正确', color: 'warning' },
  unable: { text: '需复核', color: 'default' }
} as const;

export default function App() {
  const { message } = AntApp.useApp();
  const [settings, setSettings] = useState<StoredSettings>(() => readSettings());
  const [page, setPage] = useState<'settings' | 'workspace' | 'history'>(() =>
    readSettings().apiKey ? 'workspace' : 'settings'
  );
  const [form] = Form.useForm();
  const [practiceForm] = Form.useForm();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [report, setReport] = useState<PaperAnalysis | null>(null);
  const [generatedPaper, setGeneratedPaper] = useState<GeneratedPaper | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>(() => readHistory());
  const [selectedKnowledgePoints, setSelectedKnowledgePoints] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>('');

  useEffect(() => {
    if (!settings.apiKey) {
      setPage('settings');
    }
  }, [settings.apiKey]);

  const weakPointOptions = useMemo(
    () =>
      report?.knowledgePoints
        .filter((item) => item.status !== 'mastered')
        .map((item) => ({ label: item.name, value: item.name })) ?? [],
    [report]
  );

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    fileList,
    beforeUpload: async (file) => {
      const dataUrl = await fileToDataUrl(file);
      setImages((current) => [
        ...current,
        {
          uid: file.uid,
          name: file.name,
          dataUrl
        }
      ]);
      setFileList((current) => [
        ...current,
        {
          uid: file.uid,
          name: file.name,
          status: 'done',
          url: dataUrl
        }
      ]);
      return false;
    },
    onRemove: (file) => {
      setImages((current) => current.filter((item) => item.uid !== file.uid));
      setFileList((current) => current.filter((item) => item.uid !== file.uid));
    },
    onPreview: async (file) => {
      setPreviewImage(String(file.url || file.thumbUrl || ''));
    }
  };

  const saveSettings = (values: StoredSettings) => {
    const normalized = {
      apiKey: values.apiKey.trim(),
      model: values.model.trim() || defaultSettings.model
    };
    localStorage.setItem(settingsKey, JSON.stringify(normalized));
    setSettings(normalized);
    setPage('workspace');
    message.success('配置已保存');
  };

  const analyzePaper = async () => {
    const values = await form.validateFields();

    if (!settings.apiKey) {
      setPage('settings');
      return;
    }

    if (images.length === 0) {
      message.warning('请先上传试卷图片');
      return;
    }

    setIsAnalyzing(true);
    setGeneratedPaper(null);

    try {
      const response = await fetch(`${apiBaseUrl}api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-openai-api-key': settings.apiKey
        },
        body: JSON.stringify({
          ...values,
          model: settings.model,
          images: images.map(({ name, dataUrl }) => ({ name, dataUrl }))
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || '批改失败');
      }

      setReport(data.report);
      setSelectedKnowledgePoints(
        data.report.knowledgePoints
          .filter((item: KnowledgePointStat) => item.status !== 'mastered')
          .map((item: KnowledgePointStat) => item.name)
      );
      const historyId = crypto.randomUUID();
      writeHistory({
        id: historyId,
        grade: values.grade,
        subject: values.subject,
        studentName: values.studentName || '',
        analyzedAt: data.analyzedAt,
        report: data.report,
        generatedPapers: []
      });
      setCurrentHistoryId(historyId);
      setHistory(readHistory());
      message.success('批改完成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '批改失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generatePractice = async () => {
    if (!report) {
      return;
    }

    const formValues = await form.validateFields();
    const values = await practiceForm.validateFields();

    setIsGenerating(true);

    try {
      const response = await fetch(`${apiBaseUrl}api/generate-practice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-openai-api-key': settings.apiKey
        },
        body: JSON.stringify({
          ...formValues,
          ...values,
          selectedKnowledgePoints,
          report,
          model: settings.model
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || '生成失败');
      }

      setGeneratedPaper(data.paper);
      appendGeneratedPaper(currentHistoryId, data.paper);
      setHistory(readHistory());
      message.success('练习试卷已生成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const resetWorkspace = () => {
    form.resetFields();
    practiceForm.resetFields();
    setImages([]);
    setFileList([]);
    setReport(null);
    setGeneratedPaper(null);
    setCurrentHistoryId('');
    setSelectedKnowledgePoints([]);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    form.setFieldsValue({
      grade: item.grade,
      subject: item.subject,
      studentName: item.studentName
    });
    setReport(item.report);
    setGeneratedPaper(item.generatedPapers.at(-1) || null);
    setCurrentHistoryId(item.id);
    setSelectedKnowledgePoints(
      item.report.knowledgePoints.filter((point) => point.status !== 'mastered').map((point) => point.name)
    );
    setPage('workspace');
  };

  return (
    <div className="app-shell">
        <header className="topbar">
          <button className="brand-button" type="button" onClick={() => setPage(settings.apiKey ? 'workspace' : 'settings')}>
            <FileDoneOutlined />
            <span>Paper Analyzer</span>
          </button>
          <Space>
            <Button icon={<HistoryOutlined />} onClick={() => setPage('history')}>
              历史
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => setPage('settings')}>
              设置
            </Button>
          </Space>
        </header>

        <main className="main-area">
          {page === 'settings' ? (
            <SettingsPage settings={settings} onSave={saveSettings} />
          ) : page === 'history' ? (
            <HistoryPage history={history} onLoad={loadHistoryItem} />
          ) : (
            <div className="workspace">
              <Steps
                className="workflow-steps"
                size="small"
                current={report ? (generatedPaper ? 3 : 2) : images.length ? 1 : 0}
                items={[
                  { title: '选择' },
                  { title: '上传' },
                  { title: '分析' },
                  { title: '出卷' }
                ]}
              />

              <Row gutter={[16, 16]}>
                <Col xs={24} lg={8}>
                  <Card title="试卷信息" className="panel">
                    <Form form={form} layout="vertical" initialValues={{ grade: '小学五年级', subject: '数学' }}>
                      <Form.Item name="grade" label="年级" rules={[{ required: true, message: '请选择年级' }]}>
                        <Select options={gradeOptions.map((value) => ({ label: value, value }))} />
                      </Form.Item>
                      <Form.Item name="subject" label="学科" rules={[{ required: true, message: '请选择学科' }]}>
                        <Select options={subjectOptions.map((value) => ({ label: value, value }))} />
                      </Form.Item>
                      <Form.Item name="studentName" label="学生">
                        <Input placeholder="可不填" />
                      </Form.Item>
                    </Form>

                    <Divider />

                    <Upload.Dragger {...uploadProps} className="upload-dragger">
                      <p className="ant-upload-drag-icon">
                        <CloudUploadOutlined />
                      </p>
                      <p className="ant-upload-text">上传试卷照片</p>
                      <p className="ant-upload-hint">支持多张图片</p>
                    </Upload.Dragger>

                    <Flex className="action-row" gap={8} wrap="wrap">
                      <Button icon={<ReloadOutlined />} onClick={resetWorkspace}>
                        重置
                      </Button>
                      <Button
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        loading={isAnalyzing}
                        onClick={analyzePaper}
                      >
                        开始批改
                      </Button>
                    </Flex>
                  </Card>
                </Col>

                <Col xs={24} lg={16}>
                  <Spin spinning={isAnalyzing} tip="正在识别和批改试卷">
                    {report ? (
                      <ReportView
                        report={report}
                        weakPointOptions={weakPointOptions}
                        selectedKnowledgePoints={selectedKnowledgePoints}
                        onKnowledgePointsChange={setSelectedKnowledgePoints}
                        practiceForm={practiceForm}
                        isGenerating={isGenerating}
                        onGenerate={generatePractice}
                        generatedPaper={generatedPaper}
                      />
                    ) : (
                      <Card className="empty-panel">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={images.length ? '图片已就绪，可以开始批改' : '选择年级学科并上传试卷照片'}
                        />
                      </Card>
                    )}
                  </Spin>
                </Col>
              </Row>
            </div>
          )}
        </main>

        <Modal open={Boolean(previewImage)} footer={null} onCancel={() => setPreviewImage('')} width={720}>
          <img className="preview-image" src={previewImage} alt="试卷预览" />
        </Modal>
    </div>
  );
}

function SettingsPage({ settings, onSave }: { settings: StoredSettings; onSave: (values: StoredSettings) => void }) {
  return (
    <div className="settings-page">
      <Card className="settings-card">
        <Space direction="vertical" size={18} className="full-width">
          <Space align="center">
            <Badge color={settings.apiKey ? 'green' : 'orange'} />
            <Title level={3} className="section-title">
              OpenAI 配置
            </Title>
          </Space>
          <Alert
            type={settings.apiKey ? 'success' : 'warning'}
            showIcon
            message={settings.apiKey ? 'API Key 已配置' : '首次使用需要配置 API Key'}
          />
          <Form layout="vertical" initialValues={settings.apiKey ? settings : defaultSettings} onFinish={onSave}>
            <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
              <Input.Password prefix={<KeyOutlined />} autoComplete="off" placeholder="sk-..." />
            </Form.Item>
            <Form.Item name="model" label="模型" rules={[{ required: true, message: '请输入模型名称' }]}>
              <Input />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />} block>
              保存并进入
            </Button>
          </Form>
        </Space>
      </Card>
    </div>
  );
}

function HistoryPage({ history, onLoad }: { history: HistoryItem[]; onLoad: (item: HistoryItem) => void }) {
  return (
    <Card title="历史记录" className="panel">
      {history.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录" />
      ) : (
        <List
          itemLayout="vertical"
          dataSource={history}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="load" type="link" onClick={() => onLoad(item)}>
                  打开
                </Button>
              ]}
            >
              <List.Item.Meta
                title={`${item.report.paperTitle || '试卷'} · ${item.grade} ${item.subject}`}
                description={`${new Date(item.analyzedAt).toLocaleString()} ${
                  item.studentName ? `· ${item.studentName}` : ''
                }`}
              />
              <Text type="secondary">{item.report.summary.comment}</Text>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

function ReportView({
  report,
  weakPointOptions,
  selectedKnowledgePoints,
  onKnowledgePointsChange,
  practiceForm,
  isGenerating,
  onGenerate,
  generatedPaper
}: {
  report: PaperAnalysis;
  weakPointOptions: { label: string; value: string }[];
  selectedKnowledgePoints: string[];
  onKnowledgePointsChange: (values: string[]) => void;
  practiceForm: ReturnType<typeof Form.useForm>[0];
  isGenerating: boolean;
  onGenerate: () => void;
  generatedPaper: GeneratedPaper | null;
}) {
  const accuracyPercent = Math.round((report.summary.accuracy || 0) * 100);

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Card className="panel">
        <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
          <div>
            <Title level={3} className="section-title">
              {report.paperTitle || '试卷分析'}
            </Title>
            <Paragraph className="report-comment">{report.summary.comment}</Paragraph>
          </div>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            打印
          </Button>
        </Flex>

        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}>
            <Statistic title="总分" value={report.summary.totalScore} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="得分" value={report.summary.studentScore} />
          </Col>
          <Col xs={24} md={12}>
            <Text type="secondary">正确率</Text>
            <Progress percent={accuracyPercent} strokeColor={accuracyPercent >= 80 ? '#52c41a' : '#faad14'} />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="知识点诊断" className="panel">
            <Space direction="vertical" size={10} className="full-width">
              {report.knowledgePoints.map((point) => (
                <KnowledgePointCard key={point.name} point={point} />
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="错因与建议" className="panel">
            <Space direction="vertical" size={12} className="full-width">
              <Flex gap={8} wrap="wrap">
                {report.errorTags.length ? (
                  report.errorTags.map((tag) => (
                    <Tag key={tag.name} color="red">
                      {tag.name} {tag.count}
                    </Tag>
                  ))
                ) : (
                  <Tag color="green">未发现明显错因</Tag>
                )}
              </Flex>
              <List
                size="small"
                dataSource={report.recommendations}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="单题批改" className="panel">
        <Collapse
          items={report.questions.map((question) => ({
            key: question.number,
            label: <QuestionLabel question={question} />,
            children: <QuestionDetail question={question} />
          }))}
        />
      </Card>

      <Card title="生成针对性练习" className="panel">
        <Form
          form={practiceForm}
          layout="vertical"
          initialValues={{ count: 8, difficulty: '巩固', questionTypes: ['选择题', '填空题', '应用题'] }}
        >
          <Form.Item label="知识点">
            <Checkbox.Group
              className="checkbox-grid"
              options={weakPointOptions}
              value={selectedKnowledgePoints}
              onChange={(values) => onKnowledgePointsChange(values.map(String))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="count" label="题目数量" rules={[{ required: true, message: '请输入题目数量' }]}>
                <InputNumber min={3} max={20} className="full-width" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="difficulty" label="难度">
                <Segmented block options={['基础', '巩固', '提升']} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="questionTypes" label="题型">
                <Select
                  mode="multiple"
                  options={['选择题', '填空题', '计算题', '应用题', '阅读题', '写作题'].map((value) => ({
                    label: value,
                    value
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={isGenerating} onClick={onGenerate}>
            生成新试卷
          </Button>
        </Form>
      </Card>

      {generatedPaper ? <GeneratedPaperView paper={generatedPaper} /> : null}
    </Space>
  );
}

function KnowledgePointCard({ point }: { point: KnowledgePointStat }) {
  const color = point.status === 'mastered' ? 'green' : point.status === 'practice' ? 'gold' : 'red';
  const text = point.status === 'mastered' ? '已掌握' : point.status === 'practice' ? '需巩固' : '薄弱';

  return (
    <div className="knowledge-row">
      <Flex justify="space-between" gap={12} wrap="wrap">
        <Text strong>{point.name}</Text>
        <Tag color={color}>{text}</Tag>
      </Flex>
      <Text type="secondary">{point.suggestion}</Text>
    </div>
  );
}

function QuestionLabel({ question }: { question: AnalyzedQuestion }) {
  const status = statusLabel[question.gradingStatus];

  return (
    <Flex justify="space-between" gap={12} wrap="wrap" className="question-label">
      <Space wrap>
        <Text strong>第 {question.number} 题</Text>
        <Tag color={status.color}>{status.text}</Tag>
        <Tag>{question.type}</Tag>
      </Space>
      <Text type="secondary">
        {question.studentScore}/{question.score} 分 · 置信度 {Math.round(question.confidence * 100)}%
      </Text>
    </Flex>
  );
}

function QuestionDetail({ question }: { question: AnalyzedQuestion }) {
  return (
    <Space direction="vertical" size={10} className="full-width">
      <Paragraph>{question.stem}</Paragraph>
      <InfoLine label="学生答案" value={question.studentAnswer || '未识别'} />
      <InfoLine label="标准答案" value={question.standardAnswer || '未识别'} />
      <InfoLine label="解析" value={question.explanation || '暂无'} />
      <Flex gap={8} wrap="wrap">
        {question.knowledgePoints.map((item) => (
          <Tag key={item} color="blue">
            {item}
          </Tag>
        ))}
        {question.errorTags.map((item) => (
          <Tag key={item} color="red">
            {item}
          </Tag>
        ))}
      </Flex>
    </Space>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-line">
      <Text type="secondary">{label}</Text>
      <Text>{value}</Text>
    </div>
  );
}

function GeneratedPaperView({ paper }: { paper: GeneratedPaper }) {
  return (
    <Card title={paper.title} className="panel generated-paper">
      <Paragraph>{paper.description}</Paragraph>
      <List
        dataSource={paper.questions}
        renderItem={(question) => (
          <List.Item>
            <Space direction="vertical" size={8} className="full-width">
              <Flex justify="space-between" gap={12} wrap="wrap">
                <Text strong>
                  {question.number}. {question.type}
                </Text>
                <Tag>{question.knowledgePoint}</Tag>
              </Flex>
              <Paragraph>{question.stem}</Paragraph>
              <Text type="secondary">分值：{question.score}</Text>
            </Space>
          </List.Item>
        )}
      />
      <Collapse
        className="answer-collapse"
        items={[
          {
            key: 'answers',
            label: '答案与解析',
            children: (
              <List
                dataSource={paper.answerKey}
                renderItem={(answer) => (
                  <List.Item>
                    <Space direction="vertical" className="full-width">
                      <Text strong>第 {answer.number} 题</Text>
                      <Text>{answer.answer}</Text>
                      <Text type="secondary">{answer.explanation}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            )
          }
        ]}
      />
    </Card>
  );
}

function readSettings(): StoredSettings {
  const raw = localStorage.getItem(settingsKey);
  if (!raw) {
    return defaultSettings;
  }

  try {
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

function readHistory(): HistoryItem[] {
  const raw = localStorage.getItem(historyKey);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeHistory(item: HistoryItem) {
  const next = [item, ...readHistory()].slice(0, 20);
  localStorage.setItem(historyKey, JSON.stringify(next));
}

function appendGeneratedPaper(historyId: string, paper: GeneratedPaper) {
  const next = readHistory().map((item) =>
    item.id === historyId ? { ...item, generatedPapers: [...item.generatedPapers, paper] } : item
  );
  localStorage.setItem(historyKey, JSON.stringify(next));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
