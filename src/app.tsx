import {
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  LinkOutlined,
  MenuOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined
} from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Menu,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload
} from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import type {
  AppTask,
  BankGroupCount,
  BankProgress,
  BankSubjectModule,
  BankSubjectTermTypeRow,
  CatalogResponse,
  KnowledgePoint,
  PaperTemplate,
  QuestionType,
  Student,
  Submission,
  TemplateSection,
  UploadedImage
} from './types';

const { Title, Text } = Typography;
const { TextArea } = Input;

const apiBaseUrl = import.meta.env.BASE_URL;

type ActivePage = 'upload' | 'tasks' | 'bank' | 'students' | 'practice' | 'templates';

const navigationItems: Array<{ key: ActivePage; label: string }> = [
  { key: 'upload', label: '作答上传' },
  { key: 'tasks', label: '任务管理' },
  { key: 'bank', label: '题库' },
  { key: 'students', label: '学生管理' },
  { key: 'practice', label: '出卷' },
  { key: 'templates', label: '模板库' }
];

const pageRoutes: Record<ActivePage, string> = {
  upload: 'upload',
  tasks: 'tasks',
  bank: 'bank',
  students: 'students',
  practice: 'practice',
  templates: 'templates'
};

const statusMap = {
  pending: { label: '等待', color: 'gold' },
  claimed: { label: '已领取', color: 'blue' },
  processing: { label: '处理中', color: 'processing' },
  completed: { label: '完成', color: 'success' },
  failed: { label: '失败', color: 'error' }
} as const;

export default function App() {
  const { message } = AntApp.useApp();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [analysisTasks, setAnalysisTasks] = useState<AppTask[]>([]);
  const [practiceTasks, setPracticeTasks] = useState<AppTask[]>([]);
  const [bankProgress, setBankProgress] = useState<BankProgress | null>(null);
  const [activeTab, setActiveTab] = useState<ActivePage>(() => getActivePageFromLocation());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleRouteChange = () => setActiveTab(getActivePageFromLocation());
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {
    void loadAll();
    void loadBankProgress();
    const timer = window.setInterval(() => {
      void loadTasks();
      void loadBankProgress();
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadAll() {
    setLoading(true);
    const [catalogData, studentData, submissionData] = await Promise.all([
      requestJson<CatalogResponse>('api/catalog'),
      requestJson<{ students: Student[] }>('api/students'),
      requestJson<{ submissions: Submission[] }>('api/submissions')
    ]);
    setCatalog(catalogData);
    setStudents(studentData.students);
    setSubmissions(submissionData.submissions);
    await loadTasks();
    await loadBankProgress();
    setLoading(false);
  }

  async function loadTasks() {
    const [analysisData, practiceData] = await Promise.all([
      requestJson<{ tasks: AppTask[] }>('api/analysis-tasks'),
      requestJson<{ tasks: AppTask[] }>('api/practice-tasks')
    ]);
    setAnalysisTasks(analysisData.tasks);
    setPracticeTasks(practiceData.tasks);
  }

  async function loadBankProgress() {
    try {
      const progress = await requestJson<BankProgress>('api/bank-progress');
      setBankProgress(progress);
    } catch {
      setBankProgress(null);
    }
  }

  const grades = catalog?.catalog.grades ?? [];
  const subjects = catalog?.catalog.subjects ?? [];

  const navigateToPage = (page: ActivePage) => {
    setActiveTab(page);
    setMobileMenuOpen(false);
    const targetUrl = buildPageUrl(page);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== targetUrl) {
      window.history.pushState(null, '', targetUrl);
    }
  };

  const renderActivePage = () => {
    switch (activeTab) {
      case 'tasks':
        return <TaskWorkspace analysisTasks={analysisTasks} practiceTasks={practiceTasks} />;
      case 'bank':
        return <BankProgressWorkspace progress={bankProgress} onRefresh={loadBankProgress} />;
      case 'students':
        return <StudentWorkspace students={students} submissions={submissions} practiceTasks={practiceTasks} />;
      case 'practice':
        return (
          <PracticeWorkspace
            grades={grades}
            subjects={subjects}
            students={students}
            submissions={submissions}
            catalog={catalog}
            onCreated={async () => {
              message.success('出卷任务已创建');
              navigateToPage('tasks');
              await loadAll();
            }}
          />
        );
      case 'templates':
        return catalog ? <TemplateWorkspace catalog={catalog} onChanged={loadAll} /> : null;
      case 'upload':
      default:
        return (
          <UploadWorkspace
            grades={grades}
            subjects={subjects}
            students={students}
            onCreated={async () => {
              message.success('分析任务已创建');
              navigateToPage('tasks');
              await loadAll();
            }}
          />
        );
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={() => navigateToPage('upload')}>
          <FileDoneOutlined />
          <span>李老师专属试卷系统</span>
        </button>
        <Menu
          className="topbar-menu"
          mode="horizontal"
          theme="dark"
          selectedKeys={[activeTab]}
          items={navigationItems}
          onClick={({ key }) => navigateToPage(key as ActivePage)}
        />
        <Button
          className="mobile-menu-button"
          type="text"
          aria-label="打开导航菜单"
          icon={<MenuOutlined />}
          onClick={() => setMobileMenuOpen(true)}
        />
        <Drawer
          className="mobile-nav-drawer"
          title="李老师专属试卷系统"
          placement="right"
          width={280}
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        >
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            items={navigationItems}
            onClick={({ key }) => navigateToPage(key as ActivePage)}
          />
        </Drawer>
      </header>

      <main className="main-area">
        <Spin spinning={loading}>{renderActivePage()}</Spin>
      </main>
    </div>
  );
}

function UploadWorkspace({
  grades,
  subjects,
  students,
  onCreated
}: {
  grades: string[];
  subjects: string[];
  students: Student[];
  onCreated: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [uploads, setUploads] = useState<Record<string, { images: UploadedImage[]; fileList: UploadFile[] }>>({});
  const studentOptions = students.map((student) => ({ label: student.name, value: student.name }));

  const submit = async () => {
    const values = await form.validateFields();
    const payloadStudents = (values.students || []).map((student: Record<string, unknown>, studentIndex: number) => ({
      ...student,
      submissions: ((student.submissions as Record<string, unknown>[]) || []).map((submission, submissionIndex) => ({
        ...submission,
        images: uploads[groupKey(studentIndex, submissionIndex)]?.images || []
      }))
    }));
    await requestJson('api/upload-batches', {
      method: 'POST',
      body: JSON.stringify({ title: values.title, students: payloadStudents })
    });
    form.resetFields();
    setUploads({});
    await onCreated();
  };

  return (
    <Card className="panel" title="多学生作答上传">
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          title: `作答上传 ${new Date().toLocaleDateString('zh-CN')}`,
          students: [{ name: [], submissions: [{ grade: '小学五年级', subject: '数学', requestPracticeSuggestion: true }] }]
        }}
      >
        <Form.Item name="title" label="批次标题">
          <Input />
        </Form.Item>

        <Form.List name="students">
          {(studentFields, { add: addStudent, remove: removeStudent }) => (
            <Space direction="vertical" size={16} className="full-width">
              {studentFields.map((studentField, studentIndex) => (
                <Card
                  key={studentField.key}
                  size="small"
                  className="nested-panel"
                  title={`学生 ${studentIndex + 1}`}
                  extra={
                    studentFields.length > 1 ? (
                      <Button danger type="link" onClick={() => removeStudent(studentField.name)}>
                        删除
                      </Button>
                    ) : null
                  }
                >
                  <Form.Item
                    name={[studentField.name, 'name']}
                    label="学生姓名"
                    rules={[{ required: true, message: '请输入学生姓名' }]}
                  >
                    <Select
                      mode="tags"
                      maxCount={1}
                      showSearch
                      allowClear
                      placeholder="输入或选择已有学生"
                      options={studentOptions}
                      filterOption={(input, option) => String(option?.label || '').includes(input)}
                    />
                  </Form.Item>

                  <Form.List name={[studentField.name, 'submissions']}>
                    {(submissionFields, { add: addSubmission, remove: removeSubmission }) => (
                      <Space direction="vertical" size={12} className="full-width">
                        {submissionFields.map((submissionField, submissionIndex) => (
                          <Card
                            key={submissionField.key}
                            size="small"
                            className="submission-card"
                            title={`作答 ${submissionIndex + 1}`}
                            extra={
                              submissionFields.length > 1 ? (
                                <Button danger type="link" onClick={() => removeSubmission(submissionField.name)}>
                                  删除
                                </Button>
                              ) : null
                            }
                          >
                            <Row gutter={12}>
                              <Col xs={24} md={8}>
                                <Form.Item
                                  name={[submissionField.name, 'grade']}
                                  label="年级"
                                  rules={[{ required: true, message: '请选择年级' }]}
                                >
                                  <Select options={grades.map((value) => ({ label: value, value }))} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={8}>
                                <Form.Item
                                  name={[submissionField.name, 'subject']}
                                  label="学科"
                                  rules={[{ required: true, message: '请选择学科' }]}
                                >
                                  <Select options={subjects.map((value) => ({ label: value, value }))} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={8}>
                                <Form.Item
                                  name={[submissionField.name, 'requestPracticeSuggestion']}
                                  label="后续出卷"
                                  valuePropName="checked"
                                >
                                  <Checkbox>分析后给出建议出卷数据</Checkbox>
                                </Form.Item>
                              </Col>
                            </Row>

                            <Form.Item name={[submissionField.name, 'notes']} label="补充说明">
                              <TextArea rows={2} />
                            </Form.Item>

                            <TaskUpload
                              value={uploads[groupKey(studentIndex, submissionIndex)]}
                              onChange={(value) =>
                                setUploads((current) => ({
                                  ...current,
                                  [groupKey(studentIndex, submissionIndex)]: value
                                }))
                              }
                            />
                          </Card>
                        ))}
                        <Button icon={<PlusOutlined />} onClick={() => addSubmission({ grade: '小学五年级', subject: '数学', requestPracticeSuggestion: true })}>
                          添加作答
                        </Button>
                      </Space>
                    )}
                  </Form.List>
                </Card>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => addStudent({ name: [], submissions: [{ grade: '小学五年级', subject: '数学', requestPracticeSuggestion: true }] })}>
                添加学生
              </Button>
            </Space>
          )}
        </Form.List>

        <Divider />
        <Button type="primary" icon={<SendOutlined />} onClick={() => void submit()}>
          提交分析任务
        </Button>
      </Form>
    </Card>
  );
}

function TaskUpload({
  value,
  onChange
}: {
  value?: { images: UploadedImage[]; fileList: UploadFile[] };
  onChange: (value: { images: UploadedImage[]; fileList: UploadFile[] }) => void;
}) {
  const current = value || { images: [], fileList: [] };
  const props: UploadProps = {
    accept: 'image/*',
    multiple: true,
    fileList: current.fileList,
    beforeUpload: async (file) => {
      const dataUrl = await fileToDataUrl(file);
      onChange({
        images: [...current.images, { uid: file.uid, name: file.name, dataUrl }],
        fileList: [...current.fileList, { uid: file.uid, name: file.name, status: 'done', url: dataUrl }]
      });
      return false;
    },
    onRemove: (file) => {
      onChange({
        images: current.images.filter((item) => item.uid !== file.uid),
        fileList: current.fileList.filter((item) => item.uid !== file.uid)
      });
    }
  };
  return (
    <Upload.Dragger {...props} className="upload-dragger">
      <p className="ant-upload-drag-icon">
        <CloudUploadOutlined />
      </p>
      <p className="ant-upload-text">上传此作答图片</p>
      <p className="ant-upload-hint">支持多张图片</p>
    </Upload.Dragger>
  );
}

function TaskWorkspace({ analysisTasks, practiceTasks }: { analysisTasks: AppTask[]; practiceTasks: AppTask[] }) {
  const tasks = [...analysisTasks, ...practiceTasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <Card className="panel" title="任务管理">
      {tasks.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />
      ) : (
        <List dataSource={tasks} renderItem={(task) => <TaskItem task={task} />} />
      )}
    </Card>
  );
}

function BankProgressWorkspace({ progress, onRefresh }: { progress: BankProgress | null; onRefresh: () => Promise<void> }) {
  const counters = progress?.counters ?? {};
  const ready = Number(counters.readyQuestions ?? counters.totalQuestions ?? 0);
  const needsSolving = Number(counters.needsSolvingQuestions ?? 0);
  const availabilityTotal = ready + needsSolving;
  const modules = progress?.subjectModules ?? [];
  const progressLabel = progress?.serverReceivedAt
    ? `服务器收到：${formatTime(progress.serverReceivedAt)}`
    : progress?.generatedAt
      ? `本机生成：${formatTime(progress.generatedAt)}`
      : '尚未收到题库同步数据';

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Card
        className="panel bank-hero"
        title="题库"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void onRefresh()}>
            刷新
          </Button>
        }
      >
        <Space direction="vertical" size={10} className="full-width">
          <Text type="secondary">{progressLabel}</Text>
          <div className="bank-stat-grid">
            <BankMetric label="ready 题" value={ready.toLocaleString()} tone="ok" />
            <BankMetric label="待 AI 补全" value={needsSolving.toLocaleString()} />
            <BankMetric label="ready 占比" value={`${formatPercent(ready, availabilityTotal)}%`} />
          </div>
          <BankBar label="AI 黑盒补全进度" value={ready} total={availabilityTotal || 1} />
        </Space>
      </Card>

      {modules.length ? (
        modules.map((module) => <BankSubjectModuleCard key={module.subject} module={module} />)
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <BankGroupTable title="按学科统计" nameLabel="学科" rows={progress?.bySubject ?? []} />
          </Col>
          <Col xs={24} lg={8}>
            <BankGroupTable title="按年级统计" nameLabel="年级" rows={progress?.byGrade ?? []} />
          </Col>
          <Col xs={24} lg={8}>
            <BankGroupTable title="按题型统计" nameLabel="题型" rows={progress?.byQuestionType ?? []} />
          </Col>
        </Row>
      )}
    </Space>
  );
}

function BankSubjectModuleCard({ module }: { module: BankSubjectModule }) {
  const columns = [
    {
      title: '年级/上下册',
      dataIndex: 'label',
      key: 'label',
      fixed: 'left' as const,
      width: 150
    },
    ...module.questionTypes.map((questionType) => ({
      title: questionType,
      key: questionType,
      align: 'right' as const,
      render: (_: unknown, row: BankSubjectTermTypeRow) =>
        (row.readyByType?.[questionType] ?? 0).toLocaleString()
    })),
    {
      title: 'ready 合计',
      dataIndex: 'readyTotal',
      key: 'readyTotal',
      align: 'right' as const,
      render: (value: number) => value.toLocaleString()
    },
    {
      title: '待 AI',
      dataIndex: 'needsSolvingTotal',
      key: 'needsSolvingTotal',
      align: 'right' as const,
      render: (value?: number) => Number(value ?? 0).toLocaleString()
    }
  ];

  return (
    <Card
      className="panel bank-subject-card"
      title={`${module.subject}题库`}
      extra={
        <Space size={12} wrap>
          <Text type="secondary">ready {module.readyTotal.toLocaleString()}</Text>
          <Text type="secondary">待 AI {Number(module.needsSolvingTotal ?? 0).toLocaleString()}</Text>
        </Space>
      }
    >
      <Table
        size="small"
        pagination={false}
        rowKey={(row) => `${module.subject}-${row.grade}-${row.term}`}
        dataSource={module.rows}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '暂无数据' }}
        columns={columns}
      />
    </Card>
  );
}

function BankGroupTable({ title, nameLabel, rows }: { title: string; nameLabel: string; rows: BankGroupCount[] }) {
  return (
    <Card className="panel bank-table-card" title={title}>
      <Table
        size="small"
        pagination={false}
        rowKey={(row, index) => `${row.name}-${index}`}
        dataSource={rows}
        locale={{ emptyText: '暂无数据' }}
        columns={[
          {
            title: nameLabel,
            dataIndex: 'name',
            key: 'name',
            ellipsis: true
          },
          {
            title: '数量',
            dataIndex: 'count',
            key: 'count',
            align: 'right',
            render: (value: number) => value.toLocaleString()
          }
        ]}
      />
    </Card>
  );
}

function BankMetric({ label, value, tone = 'plain' }: { label: string; value: ReactNode; tone?: 'plain' | 'ok' | 'warn' }) {
  return (
    <div className={`bank-metric ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function BankBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = Math.max(0, Math.min(100, Math.round((value / Math.max(total, 1)) * 100)));
  return (
    <div className="bank-bar-block">
      <div className="bank-metric-row">
        <Text type="secondary">{label}</Text>
        <Text strong>{percent}%</Text>
      </div>
      <div className="bank-bar">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function formatPercent(value: number, total: number) {
  if (!total) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function TaskItem({ task }: { task: AppTask }) {
  const meta = statusMap[task.status];
  return (
    <List.Item>
      <List.Item.Meta
        title={
          <Space wrap>
            <Text strong>{task.taskType === 'analysis' ? '分析任务' : '出卷任务'}</Text>
            <Tag color={meta.color}>{meta.label}</Tag>
            <Text type="secondary">{task.id}</Text>
          </Space>
        }
        description={task.statusMessage}
      />
      <Space direction="vertical" className="task-extra">
        <Text type="secondary">{formatTime(task.createdAt)}</Text>
        {'submissions' in task && task.submissions?.length ? <Text>{task.submissions.length} 份作答</Text> : null}
        {task.resultFiles?.map((file) => (
          <Button key={file.id} type="link" href={assetUrl(file.url)} target="_blank" icon={<LinkOutlined />}>
            {file.name}
          </Button>
        ))}
      </Space>
    </List.Item>
  );
}

function StudentWorkspace({
  students,
  submissions,
  practiceTasks
}: {
  students: Student[];
  submissions: Submission[];
  practiceTasks: AppTask[];
}) {
  const [activeStudentId, setActiveStudentId] = useState('');
  const active = students.find((student) => student.id === activeStudentId) || students[0];
  const studentSubmissions = active ? submissions.filter((item) => item.studentId === active.id) : [];
  const studentPracticeTasks = active ? practiceTasks.filter((item) => item.studentIds?.includes(active.id)) : [];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <Card className="panel" title="学生列表">
          <List
            dataSource={students}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无学生" /> }}
            renderItem={(student) => (
              <List.Item className={student.id === active?.id ? 'active-task' : ''} onClick={() => setActiveStudentId(student.id)}>
                <List.Item.Meta title={student.name} description={`${student.currentGrade || '未设置年级'} · ${student.profileSummary || '暂无档案'}`} />
              </List.Item>
            )}
          />
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        {active ? (
          <Card className="panel" title={`${active.name} 档案`}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="当前年级">{active.currentGrade || '-'}</Descriptions.Item>
              <Descriptions.Item label="综合评价">{active.profileSummary || '暂无'}</Descriptions.Item>
              <Descriptions.Item label="优势">{active.strengths?.join('、') || '暂无'}</Descriptions.Item>
              <Descriptions.Item label="不足">{active.weaknesses?.join('、') || '暂无'}</Descriptions.Item>
              <Descriptions.Item label="趋势">{active.trendSummary || '暂无'}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <Title level={5}>作答历史</Title>
            <SubmissionList submissions={studentSubmissions} />
            <Divider />
            <Title level={5}>复习卷</Title>
            <List
              dataSource={studentPracticeTasks}
              locale={{ emptyText: '暂无复习卷' }}
              renderItem={(task) => <TaskItem task={task} />}
            />
          </Card>
        ) : (
          <Card className="panel">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无学生" />
          </Card>
        )}
      </Col>
    </Row>
  );
}

function SubmissionList({ submissions }: { submissions: Submission[] }) {
  return (
    <List
      dataSource={submissions}
      locale={{ emptyText: '暂无作答' }}
      renderItem={(submission) => (
        <List.Item>
          <List.Item.Meta
            title={`${submission.grade} ${submission.subject}`}
            description={String((submission.analysisResult?.overallComment as string) || submission.notes || '等待分析')}
          />
          <Tag color={statusMap[submission.analysisStatus]?.color}>{statusMap[submission.analysisStatus]?.label}</Tag>
        </List.Item>
      )}
    />
  );
}

function PracticeWorkspace({
  grades,
  subjects,
  students,
  submissions,
  catalog,
  onCreated
}: {
  grades: string[];
  subjects: string[];
  students: Student[];
  submissions: Submission[];
  catalog: CatalogResponse | null;
  onCreated: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [mode, setMode] = useState('submission');
  const selectedTemplateId = Form.useWatch('templateId', form);
  const selectedSubject = Form.useWatch('subject', form);
  const templates = catalog?.paperTemplates ?? [];
  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);

  useEffect(() => {
    if (selectedTemplate) {
      form.setFieldsValue({
        subject: selectedTemplate.subject,
        grade: selectedTemplate.gradeRange[0],
        layout: {
          orientation: selectedTemplate.orientation,
          sections: selectedTemplate.sections
        }
      });
    }
  }, [form, selectedTemplate]);

  const submit = async () => {
    const values = await form.validateFields();
    await requestJson('api/practice-tasks', {
      method: 'POST',
      body: JSON.stringify({ ...values, mode })
    });
    form.resetFields();
    await onCreated();
  };

  const knowledgeOptions = (catalog?.knowledgePoints ?? [])
    .filter((item) => !form.getFieldValue('subject') || item.subject === form.getFieldValue('subject'))
    .map((item) => ({ label: `${item.name} · ${item.gradeRange.join('/')}`, value: item.id }));

  return (
    <Card className="panel" title="出卷工作台">
      <Form form={form} layout="vertical" initialValues={{ mode: 'submission', subject: '数学', grade: '小学五年级', layout: { orientation: 'portrait', sections: [] } }}>
        <Form.Item label="出卷模式">
          <Select
            value={mode}
            onChange={setMode}
            options={[
              { label: '按单次作答', value: 'submission' },
              { label: '按学生档案', value: 'student-profile' },
              { label: '空白出卷', value: 'blank' },
              { label: '批量个性化', value: 'batch-student' },
              { label: '批量统一', value: 'batch-unified' }
            ]}
          />
        </Form.Item>

        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="studentIds" label="学生">
              <Select
                mode="multiple"
                options={students.map((student) => ({ label: student.name, value: student.id }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="submissionIds" label="作答记录">
              <Select
                mode="multiple"
                options={submissions.map((item) => ({
                  label: `${item.studentNameSnapshot} · ${item.grade} ${item.subject} · ${formatTime(item.createdAt)}`,
                  value: item.id
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Form.Item name="subject" label="学科" rules={[{ required: true, message: '请选择学科' }]}>
              <Select options={subjects.map((value) => ({ label: value, value }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="grade" label="年级">
              <Select options={grades.map((value) => ({ label: value, value }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="templateId" label="题型模板">
              <Select allowClear options={templates.map((item) => ({ label: `${item.subject} · ${item.name}`, value: item.id }))} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="knowledgePointIds" label="知识点范围">
          <Select mode="multiple" showSearch options={knowledgeOptions} />
        </Form.Item>

        <Form.Item name="requirements" label="补充要求">
          <TextArea rows={3} placeholder="例如：保持原卷题型数量，重点加强应用题审题" />
        </Form.Item>

        <LayoutEditor questionTypes={catalog?.questionTypes ?? []} subject={selectedSubject} />

        <Button type="primary" icon={<SendOutlined />} onClick={() => void submit()}>
          创建出卷任务
        </Button>
      </Form>
    </Card>
  );
}

function LayoutEditor({ questionTypes, subject }: { questionTypes: QuestionType[]; subject?: string }) {
  const form = Form.useFormInstance();
  const watchedSubject = Form.useWatch('subject', form);
  const sections = (Form.useWatch(['layout', 'sections'], form) || []) as TemplateSection[];
  const effectiveSubject = subject || watchedSubject;
  const questionTypeOptions = getQuestionTypeOptions(questionTypes, effectiveSubject);

  const createSection = (index: number) => {
    const questionTypeName = getNextQuestionTypeName(questionTypeOptions, sections);
    return {
      name: `模块 ${index + 1}`,
      questionTypeName,
      count: 5,
      order: index + 1
    };
  };

  return (
    <Card size="small" title="试卷版式" className="nested-panel">
      <Form.Item name={['layout', 'orientation']} label="版式">
        <Select
          options={[
            { label: '竖版', value: 'portrait' },
            { label: '横版', value: 'landscape' }
          ]}
        />
      </Form.Item>
      <Form.List name={['layout', 'sections']}>
        {(fields, { add, remove }) => (
          <Space direction="vertical" className="full-width">
            {fields.map((field, index) => (
              <Row key={field.key} gutter={8} align="middle">
                <Col xs={24} md={7}>
                  <Form.Item name={[field.name, 'name']} label="模块名">
                    <Input placeholder={`模块 ${index + 1}`} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={7}>
                  <Form.Item name={[field.name, 'questionTypeName']} label="题型">
                    <Select showSearch options={questionTypeOptions} />
                  </Form.Item>
                </Col>
                <Col xs={16} md={5}>
                  <Form.Item name={[field.name, 'count']} label="数量">
                    <InputNumber min={1} max={80} className="full-width" />
                  </Form.Item>
                </Col>
                <Col xs={8} md={5}>
                  <Button danger onClick={() => remove(field.name)}>
                    删除
                  </Button>
                </Col>
              </Row>
            ))}
            <Button icon={<PlusOutlined />} onClick={() => add(createSection(fields.length))}>
              添加模块
            </Button>
          </Space>
        )}
      </Form.List>
    </Card>
  );
}

function TemplateWorkspace({ catalog, onChanged }: { catalog: CatalogResponse; onChanged: () => Promise<void> }) {
  return <TemplateManager catalog={catalog} onChanged={onChanged} />;
}

function QuestionTypeManager({ catalog, onChanged }: { catalog: CatalogResponse; onChanged: () => Promise<void> }) {
  const [questionForm] = Form.useForm();

  const addQuestionType = async () => {
    const values = await questionForm.validateFields();
    await requestJson('api/question-types', { method: 'POST', body: JSON.stringify(values) });
    questionForm.resetFields();
    await onChanged();
  };

  const groupedQuestionTypes = useMemo(() => groupBy(catalog.questionTypes, (item) => item.subject), [catalog.questionTypes]);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <Card size="small" title="新增题型" className="nested-panel">
          <Form form={questionForm} layout="vertical" initialValues={{ subject: '数学' }}>
            <Form.Item name="subject" label="学科" rules={[{ required: true, message: '请选择学科' }]}>
              <Select options={catalog.catalog.subjects.map((value) => ({ label: value, value }))} />
            </Form.Item>
            <Form.Item name="name" label="题型名称" rules={[{ required: true, message: '请输入题型名称' }]}>
              <Input />
            </Form.Item>
            <Button icon={<PlusOutlined />} onClick={() => void addQuestionType()}>
              新增题型
            </Button>
          </Form>
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        <List
          size="small"
          dataSource={Object.entries(groupedQuestionTypes)}
          renderItem={([subject, items]) => (
            <List.Item>
              <List.Item.Meta
                title={`${subject} · ${items.length} 个题型`}
                description={
                  <Flex gap={6} wrap="wrap">
                    {(items as QuestionType[]).map((item) => (
                      <Tag key={item.id} color={item.isSystem ? 'blue' : 'green'}>
                        {item.name}
                      </Tag>
                    ))}
                  </Flex>
                }
              />
            </List.Item>
          )}
        />
      </Col>
    </Row>
  );
}

function TemplateManager({ catalog, onChanged }: { catalog: CatalogResponse; onChanged: () => Promise<void> }) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [detailTemplate, setDetailTemplate] = useState<PaperTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PaperTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const selectedSubject = Form.useWatch('subject', form) || '数学';
  const subjectOptions = catalog.catalog.subjects.map((value) => ({ label: value, value }));
  const gradeOptions = getGradesForSubject(catalog, selectedSubject);
  const templates = catalog.paperTemplates;

  const openCreate = () => {
    const subject = '数学';
    setEditingTemplate(null);
    form.setFieldsValue(defaultTemplateValues(getGradesForSubject(catalog, subject)));
    setEditorOpen(true);
  };

  const openEdit = (template: PaperTemplate) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      name: template.name,
      subject: template.subject,
      gradeRange: template.gradeRange,
      layout: {
        orientation: template.orientation,
        sections: template.sections
      }
    });
    setEditorOpen(true);
  };

  const handleSubjectChange = (subject: string) => {
    const availableGrades = getGradesForSubject(catalog, subject);
    const currentGrades = (form.getFieldValue('gradeRange') || []) as string[];
    const currentLayout = form.getFieldValue('layout') || {};
    form.setFieldsValue({
      gradeRange: currentGrades.filter((grade) => availableGrades.includes(grade)),
      layout: { ...currentLayout, sections: [] }
    });
  };

  const saveTemplate = async () => {
    const values = await form.validateFields();
    const path = editingTemplate ? `api/paper-templates/${editingTemplate.id}` : 'api/paper-templates';
    await requestJson(path, {
      method: editingTemplate ? 'PATCH' : 'POST',
      body: JSON.stringify({
        name: values.name,
        subject: values.subject,
        gradeRange: values.gradeRange || [],
        orientation: values.layout?.orientation || 'portrait',
        sections: values.layout?.sections || []
      })
    });
    form.resetFields();
    setEditorOpen(false);
    setEditingTemplate(null);
    message.success(editingTemplate ? '模板已更新' : '模板已创建');
    await onChanged();
  };

  const deleteTemplate = async (template: PaperTemplate) => {
    await requestJson(`api/paper-templates/${template.id}`, { method: 'DELETE' });
    message.success('模板已删除');
    await onChanged();
  };

  return (
    <Card className="panel" title="模板库">
      <Space direction="vertical" size={16} className="full-width">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建模板
        </Button>
        <Table
          rowKey="id"
          dataSource={templates}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '暂无模板' }}
          columns={[
            {
              title: '模板名称',
              dataIndex: 'name',
              key: 'name',
              width: 240,
              render: (value: string, item: PaperTemplate) => (
                <Button type="link" className="template-name-button" onClick={() => setDetailTemplate(item)}>
                  {value}
                </Button>
              )
            },
            {
              title: '学科',
              dataIndex: 'subject',
              key: 'subject',
              width: 90
            },
            {
              title: '适用年级',
              dataIndex: 'gradeRange',
              key: 'gradeRange',
              render: (value: string[]) => formatGradeRange(value, catalog.catalog.grades)
            },
            {
              title: '版式',
              dataIndex: 'orientation',
              key: 'orientation',
              width: 90,
              render: (value: PaperTemplate['orientation']) => (value === 'portrait' ? '竖版' : '横版')
            },
            {
              title: '题型排布',
              key: 'sections',
              render: (_: unknown, item: PaperTemplate) => (
                <Flex gap={6} wrap="wrap" className="template-sections">
                  {item.sections.map((section) => (
                    <Tag key={section.id || `${item.id}-${section.order}`}>
                      {section.name}：{section.questionTypeName} x {section.count}
                    </Tag>
                  ))}
                </Flex>
              )
            },
            {
              title: '操作',
              key: 'actions',
              fixed: 'right' as const,
              width: 112,
              render: (_: unknown, item: PaperTemplate) => (
                <Space size={8}>
                  <Tooltip title="编辑">
                    <Button aria-label="编辑模板" icon={<EditOutlined />} onClick={() => openEdit(item)} />
                  </Tooltip>
                  <Popconfirm
                    title="删除模板"
                    description={`确定删除“${item.name}”吗？`}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void deleteTemplate(item)}
                  >
                    <Tooltip title="删除">
                      <Button danger aria-label="删除模板" icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Space>

      <Modal
        title={detailTemplate?.name}
        open={Boolean(detailTemplate)}
        footer={null}
        width={760}
        onCancel={() => setDetailTemplate(null)}
      >
        {detailTemplate ? <TemplateDetail template={detailTemplate} allGrades={catalog.catalog.grades} /> : null}
      </Modal>

      <Modal
        title={editingTemplate ? '编辑试卷模板' : '新建试卷模板'}
        open={editorOpen}
        width={880}
        okText="保存"
        cancelText="取消"
        onOk={() => void saveTemplate()}
        onCancel={() => {
          setEditorOpen(false);
          setEditingTemplate(null);
        }}
      >
        <Form form={form} layout="vertical" initialValues={defaultTemplateValues(getGradesForSubject(catalog, '数学'))}>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="subject" label="学科" rules={[{ required: true, message: '请选择学科' }]}>
                <Select options={subjectOptions} onChange={handleSubjectChange} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="gradeRange" label="适用年级" rules={[{ required: true, type: 'array', min: 1, message: '请选择适用年级' }]}>
                <Select mode="multiple" options={gradeOptions.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
          </Row>
          <LayoutEditor questionTypes={catalog.questionTypes} subject={selectedSubject} />
        </Form>
      </Modal>
    </Card>
  );
}

function TemplateDetail({ template, allGrades }: { template: PaperTemplate; allGrades: string[] }) {
  return (
    <Space direction="vertical" size={16} className="full-width">
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="学科">{template.subject}</Descriptions.Item>
        <Descriptions.Item label="适用年级">{formatGradeRange(template.gradeRange, allGrades)}</Descriptions.Item>
        <Descriptions.Item label="版式">{template.orientation === 'portrait' ? '竖版' : '横版'}</Descriptions.Item>
        <Descriptions.Item label="来源">{template.isSystem ? '系统内置' : '自定义'}</Descriptions.Item>
      </Descriptions>
      <Table
        size="small"
        rowKey={(section) => section.id || `${section.order}-${section.name}`}
        pagination={false}
        dataSource={[...template.sections].sort((a, b) => a.order - b.order)}
        columns={[
          { title: '顺序', dataIndex: 'order', key: 'order', width: 80 },
          { title: '模块', dataIndex: 'name', key: 'name' },
          { title: '题型', dataIndex: 'questionTypeName', key: 'questionTypeName' },
          { title: '数量', dataIndex: 'count', key: 'count', width: 90 },
          { title: '说明', dataIndex: 'notes', key: 'notes', render: (value?: string) => value || '-' }
        ]}
      />
    </Space>
  );
}

function defaultTemplateValues(gradeRange: string[]) {
  return {
    name: '小学数学标准期末卷',
    subject: '数学',
    gradeRange,
    layout: {
      orientation: 'portrait',
      sections: [
        { name: '一、填空题', questionTypeName: '填空', count: 15, order: 1, notes: '30分' },
        { name: '二、选择题', questionTypeName: '选择', count: 6, order: 2, notes: '6分' },
        { name: '三、判断题', questionTypeName: '判断', count: 6, order: 3, notes: '6分' },
        { name: '四、计算题', questionTypeName: '计算', count: 10, order: 4, notes: '16分' },
        { name: '五、图形计算', questionTypeName: '图形与几何', count: 1, order: 5, notes: '4分' },
        { name: '六、解决问题', questionTypeName: '应用题', count: 6, order: 6, notes: '38分' }
      ]
    }
  };
}

function SyllabusWorkspace({ catalog }: { catalog: CatalogResponse }) {
  const [selectedGrade, setSelectedGrade] = useState(catalog.catalog.grades[0] || '');
  const availableSubjects = useMemo(() => getSubjectsForGrade(catalog, selectedGrade), [catalog, selectedGrade]);
  const [selectedSubject, setSelectedSubject] = useState(availableSubjects[0] || '');
  const effectiveSubject = availableSubjects.includes(selectedSubject) ? selectedSubject : availableSubjects[0] || '';
  const points = catalog.knowledgePoints.filter(
    (item) => item.isActive && item.subject === effectiveSubject && item.gradeRange.includes(selectedGrade)
  );
  const version = getTextbookVersion(catalog, selectedGrade, effectiveSubject);

  useEffect(() => {
    if (!availableSubjects.includes(selectedSubject)) {
      setSelectedSubject(availableSubjects[0] || '');
    }
  }, [availableSubjects, selectedSubject]);

  const groupedByStage = useMemo(() => groupBy(catalog.catalog.grades, getStageByGrade), [catalog.catalog.grades]);
  const groupedPoints = useMemo(() => groupBy(points, (item) => item.name.split('：')[0] || '知识点'), [points]);

  return (
    <Row gutter={[16, 16]} className="syllabus-layout">
      <Col xs={24} lg={7}>
        <Card className="panel" title="年级与学科">
          <Space direction="vertical" size={16} className="full-width">
            {Object.entries(groupedByStage).map(([stage, grades]) => (
              <div key={stage}>
                <Text strong>{stage}</Text>
                <div className="choice-list">
                  {(grades as string[]).map((grade) => (
                    <Button
                      key={grade}
                      type={selectedGrade === grade ? 'primary' : 'default'}
                      onClick={() => setSelectedGrade(grade)}
                    >
                      {grade}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <Divider />
            <div>
              <Text strong>学科</Text>
              <div className="choice-list">
                {availableSubjects.map((subject) => (
                  <Button
                    key={subject}
                    type={effectiveSubject === subject ? 'primary' : 'default'}
                    onClick={() => setSelectedSubject(subject)}
                  >
                    {subject}
                  </Button>
                ))}
              </div>
            </div>
          </Space>
        </Card>
      </Col>
      <Col xs={24} lg={17}>
        <Card className="panel" title={`${selectedGrade} · ${effectiveSubject} 教学大纲`}>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="教材版本">{version ? `${version.publisher} · ${version.area}` : '暂无配置'}</Descriptions.Item>
            <Descriptions.Item label="知识点数量">{points.length}</Descriptions.Item>
          </Descriptions>
          <Divider />
          {points.length ? (
            <Space direction="vertical" size={12} className="full-width">
              {Object.entries(groupedPoints).map(([group, items]) => (
                <div key={group} className="knowledge-row">
                  <Text strong>{group}</Text>
                  <Flex gap={6} wrap="wrap">
                    {(items as KnowledgePoint[]).map((item) => (
                      <Tag key={item.id}>{item.name}</Tag>
                    ))}
                  </Flex>
                </div>
              ))}
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无知识点" />
          )}
        </Card>
      </Col>
    </Row>
  );
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || '请求失败');
  }
  return data;
}

function assetUrl(url: string) {
  return `${apiBaseUrl}${url.replace(/^\//u, '')}`;
}

function getActivePageFromLocation(): ActivePage {
  if (typeof window === 'undefined') {
    return 'upload';
  }
  const basePath = new URL(apiBaseUrl, window.location.origin).pathname.replace(/\/$/u, '');
  const currentPath = window.location.pathname.replace(/\/$/u, '');
  const relativePath = (basePath && currentPath.startsWith(basePath)
    ? currentPath.slice(basePath.length)
    : currentPath
  ).replace(/^\//u, '');
  return (Object.entries(pageRoutes).find(([, route]) => route === relativePath)?.[0] as ActivePage | undefined) || 'upload';
}

function buildPageUrl(page: ActivePage) {
  const base = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;
  return `${base}${pageRoutes[page]}`;
}

function groupKey(studentIndex: number, submissionIndex: number) {
  return `${studentIndex}-${submissionIndex}`;
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((result, item) => {
    const key = getKey(item);
    result[key] = [...(result[key] || []), item];
    return result;
  }, {});
}

function getQuestionTypeOptions(questionTypes: QuestionType[], subject?: string) {
  const seen = new Set<string>();
  return questionTypes
    .filter((item) => item.isActive && (!subject || item.subject === subject))
    .filter((item) => {
      if (seen.has(item.name)) {
        return false;
      }
      seen.add(item.name);
      return true;
    })
    .map((item) => ({ label: item.name, value: item.name }));
}

function getNextQuestionTypeName(options: Array<{ label: string; value: string }>, sections: TemplateSection[]) {
  const used = new Set((sections || []).map((section) => section?.questionTypeName).filter(Boolean));
  return options.find((item) => !used.has(item.value))?.value || options[0]?.value || '自定义题型';
}

function getGradesForSubject(catalog: CatalogResponse, subject?: string) {
  if (!subject) {
    return catalog.catalog.grades;
  }
  const fromKnowledgePoints = catalog.knowledgePoints
    .filter((item) => item.isActive && item.subject === subject)
    .flatMap((item) => item.gradeRange);
  if (fromKnowledgePoints.length) {
    const available = new Set(fromKnowledgePoints);
    return catalog.catalog.grades.filter((grade) => available.has(grade));
  }
  const stages = new Set(catalog.catalog.textbookVersions.filter((item) => item.subject === subject).map((item) => item.stage));
  if (stages.size) {
    return catalog.catalog.grades.filter((grade) => stages.has(getStageByGrade(grade)));
  }
  return catalog.catalog.grades;
}

function formatGradeRange(gradeRange: string[], allGrades: string[]) {
  if (!gradeRange.length) {
    return '不限年级';
  }
  const selected = new Set(gradeRange);
  const consumed = new Set<string>();
  const labels: string[] = [];

  ['小学', '初中'].forEach((stage) => {
    const stageGrades = allGrades.filter((grade) => getStageByGrade(grade) === stage);
    if (stageGrades.length && stageGrades.every((grade) => selected.has(grade))) {
      labels.push(stage);
      stageGrades.forEach((grade) => consumed.add(grade));
    }
  });

  allGrades.forEach((grade) => {
    if (selected.has(grade) && !consumed.has(grade)) {
      labels.push(grade);
    }
  });
  gradeRange.forEach((grade) => {
    if (!allGrades.includes(grade) && !labels.includes(grade)) {
      labels.push(grade);
    }
  });

  return labels.join('、');
}

function getStageByGrade(grade: string) {
  return grade.startsWith('小学') ? '小学' : '初中';
}

function getSubjectsForGrade(catalog: CatalogResponse, grade: string) {
  const stage = getStageByGrade(grade);
  return catalog.catalog.textbookVersions
    .filter((item) => item.stage === stage)
    .map((item) => item.subject)
    .filter((subject, index, list) => list.indexOf(subject) === index);
}

function getTextbookVersion(catalog: CatalogResponse, grade: string, subject: string) {
  const stage = getStageByGrade(grade);
  return catalog.catalog.textbookVersions.find((item) => item.stage === stage && item.subject === subject);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
