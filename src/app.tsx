import {
  ArrowLeftOutlined,
  CloudUploadOutlined,
  FileDoneOutlined,
  LinkOutlined,
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
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import type {
  AppTask,
  CatalogResponse,
  KnowledgePoint,
  QuestionType,
  Student,
  Submission,
  TemplateSection,
  UploadedImage
} from './types';

const { Title, Text } = Typography;
const { TextArea } = Input;

const apiBaseUrl = import.meta.env.BASE_URL;

type ActivePage = 'upload' | 'tasks' | 'students' | 'practice' | 'templates' | 'syllabus';

const navigationItems: Array<{ key: ActivePage; label: string }> = [
  { key: 'upload', label: '作答上传' },
  { key: 'tasks', label: '任务管理' },
  { key: 'students', label: '学生管理' },
  { key: 'practice', label: '出卷' },
  { key: 'templates', label: '模板库' },
  { key: 'syllabus', label: '教学大纲' }
];

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
  const [activeTab, setActiveTab] = useState<ActivePage>('upload');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAll();
    const timer = window.setInterval(() => void loadTasks(), 15000);
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

  const grades = catalog?.catalog.grades ?? [];
  const subjects = catalog?.catalog.subjects ?? [];

  const renderActivePage = () => {
    switch (activeTab) {
      case 'tasks':
        return <TaskWorkspace analysisTasks={analysisTasks} practiceTasks={practiceTasks} />;
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
              setActiveTab('tasks');
              await loadAll();
            }}
          />
        );
      case 'templates':
        return catalog ? <TemplateWorkspace catalog={catalog} onChanged={loadAll} /> : null;
      case 'syllabus':
        return catalog ? <SyllabusWorkspace catalog={catalog} /> : null;
      case 'upload':
      default:
        return (
          <UploadWorkspace
            grades={grades}
            subjects={subjects}
            students={students}
            onCreated={async () => {
              message.success('分析任务已创建');
              setActiveTab('tasks');
              await loadAll();
            }}
          />
        );
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={() => void loadAll()}>
          <FileDoneOutlined />
          <span>Paper Analyzer</span>
        </button>
        <nav className="topbar-nav" aria-label="页面导航">
          {navigationItems.map((item) => (
            <Button
              key={item.key}
              type={activeTab === item.key ? 'primary' : 'text'}
              onClick={() => setActiveTab(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </nav>
        <Button className="topbar-refresh" icon={<ReloadOutlined />} onClick={() => void loadAll()}>
          刷新
        </Button>
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
  const [activeTab, setActiveTab] = useState('question-types');
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  if (activeTab === 'paper-templates' && creatingTemplate) {
    return (
      <TemplateCreatePage
        catalog={catalog}
        onBack={() => setCreatingTemplate(false)}
        onCreated={async () => {
          setCreatingTemplate(false);
          await onChanged();
        }}
      />
    );
  }

  return (
    <Card className="panel" title="模板库">
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        items={[
          {
            key: 'question-types',
            label: '题型管理',
            children: <QuestionTypeManager catalog={catalog} onChanged={onChanged} />
          },
          {
            key: 'paper-templates',
            label: '模板管理',
            children: <TemplateManager catalog={catalog} onCreate={() => setCreatingTemplate(true)} />
          }
        ]}
      />
    </Card>
  );
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

function TemplateManager({ catalog, onCreate }: { catalog: CatalogResponse; onCreate: () => void }) {
  return (
    <Space direction="vertical" size={16} className="full-width">
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        新建模板
      </Button>
      <List
        size="small"
        dataSource={catalog.paperTemplates}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              title={`${item.subject} · ${item.name}`}
              description={`${item.gradeRange.join('、') || '全年级'} · ${item.orientation === 'portrait' ? '竖版' : '横版'} · ${item.sections.length} 个模块`}
            />
            <Flex gap={6} wrap="wrap" className="template-sections">
              {item.sections.map((section) => (
                <Tag key={section.id || `${item.id}-${section.order}`}>
                  {section.name}：{section.questionTypeName} x {section.count}
                </Tag>
              ))}
            </Flex>
          </List.Item>
        )}
      />
    </Space>
  );
}

function TemplateCreatePage({
  catalog,
  onBack,
  onCreated
}: {
  catalog: CatalogResponse;
  onBack: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const selectedSubject = Form.useWatch('subject', form);

  const addTemplate = async () => {
    const values = await form.validateFields();
    await requestJson('api/paper-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: values.name,
        subject: values.subject,
        gradeRange: values.gradeRange || [],
        orientation: values.layout?.orientation || 'portrait',
        sections: values.layout?.sections || []
      })
    });
    form.resetFields();
    await onCreated();
  };

  return (
    <Card
      className="panel"
      title="新建试卷模板"
      extra={
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回模板库
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          subject: '数学',
          gradeRange: ['小学五年级'],
          layout: {
            orientation: 'portrait',
            sections: [{ name: '一、填空题', questionTypeName: '填空', count: 10, order: 1 }]
          }
        }}
      >
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="subject" label="学科" rules={[{ required: true, message: '请选择学科' }]}>
              <Select options={catalog.catalog.subjects.map((value) => ({ label: value, value }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="gradeRange" label="适用年级">
              <Select mode="multiple" options={catalog.catalog.grades.map((value) => ({ label: value, value }))} />
            </Form.Item>
          </Col>
        </Row>
        <LayoutEditor questionTypes={catalog.questionTypes} subject={selectedSubject} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void addTemplate()}>
          保存模板
        </Button>
      </Form>
    </Card>
  );
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
