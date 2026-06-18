import {
  CloudUploadOutlined,
  FileDoneOutlined,
  LinkOutlined,
  ReloadOutlined,
  SendOutlined
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import type { PaperTask, TaskStatus, UploadedImage } from './types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const apiBaseUrl = import.meta.env.BASE_URL;

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

const statusMeta: Record<TaskStatus, { label: string; color: string; step: number }> = {
  pending: { label: '等待处理', color: 'gold', step: 1 },
  claimed: { label: '已领取', color: 'blue', step: 2 },
  processing: { label: '处理中', color: 'processing', step: 2 },
  completed: { label: '已完成', color: 'success', step: 3 },
  failed: { label: '失败', color: 'error', step: 2 }
};

export default function App() {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [tasks, setTasks] = useState<PaperTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState('');

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) || tasks[0] || null,
    [activeTaskId, tasks]
  );

  useEffect(() => {
    void loadTasks();
    const timer = window.setInterval(() => {
      void loadTasks(false);
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    fileList,
    beforeUpload: async (file) => {
      const dataUrl = await fileToDataUrl(file);
      setImages((current) => [...current, { uid: file.uid, name: file.name, dataUrl }]);
      setFileList((current) => [...current, { uid: file.uid, name: file.name, status: 'done', url: dataUrl }]);
      return false;
    },
    onRemove: (file) => {
      setImages((current) => current.filter((item) => item.uid !== file.uid));
      setFileList((current) => current.filter((item) => item.uid !== file.uid));
    },
    onPreview: (file) => {
      setPreviewImage(String(file.url || file.thumbUrl || ''));
    }
  };

  async function loadTasks(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const data = await requestJson<{ tasks: PaperTask[] }>('api/tasks');
      setTasks(data.tasks);
      if (!activeTaskId && data.tasks[0]) {
        setActiveTaskId(data.tasks[0].id);
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  async function createTask() {
    const values = await form.validateFields();

    if (images.length === 0) {
      message.warning('请先上传试卷照片');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await requestJson<{ task: PaperTask }>('api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          images: images.map(({ name, dataUrl }) => ({ name, dataUrl }))
        })
      });
      message.success('任务已创建，等待家里 PC Codex Agent 处理');
      setActiveTaskId(data.task.id);
      setImages([]);
      setFileList([]);
      form.resetFields();
      await loadTasks(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={() => void loadTasks()}>
          <FileDoneOutlined />
          <span>Paper Analyzer</span>
        </button>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadTasks()}>
            刷新
          </Button>
        </Space>
      </header>

      <main className="main-area">
        <Alert
          className="intro-alert"
          type="info"
          showIcon
          message="手机上传试卷任务，家里 Windows PC 上的 Codex Agent 会通过 MCP 领取任务并回传结果。"
        />

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={9}>
            <Card title="新建试卷任务" className="panel">
              <Form
                form={form}
                layout="vertical"
                initialValues={{ grade: '小学五年级', subject: '数学', practiceCount: 10, difficulty: '巩固' }}
              >
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="grade" label="年级" rules={[{ required: true, message: '请选择年级' }]}>
                      <Select options={gradeOptions.map((value) => ({ label: value, value }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="subject" label="学科" rules={[{ required: true, message: '请选择学科' }]}>
                      <Select options={subjectOptions.map((value) => ({ label: value, value }))} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="studentName" label="学生">
                      <Input placeholder="可不填" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="practiceCount" label="练习题数">
                      <InputNumber min={3} max={30} className="full-width" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="difficulty" label="练习难度">
                  <Select
                    options={['基础', '巩固', '提升'].map((value) => ({
                      label: value,
                      value
                    }))}
                  />
                </Form.Item>

                <Form.Item name="notes" label="补充说明">
                  <TextArea rows={3} placeholder="例如：重点看计算过程，生成一份可打印试卷" />
                </Form.Item>
              </Form>

              <Upload.Dragger {...uploadProps} className="upload-dragger">
                <p className="ant-upload-drag-icon">
                  <CloudUploadOutlined />
                </p>
                <p className="ant-upload-text">上传试卷照片</p>
                <p className="ant-upload-hint">支持多张图片</p>
              </Upload.Dragger>

              <Flex className="action-row" gap={8} wrap="wrap">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    setImages([]);
                    setFileList([]);
                  }}
                >
                  清空图片
                </Button>
                <Button type="primary" icon={<SendOutlined />} loading={isSubmitting} onClick={() => void createTask()}>
                  提交任务
                </Button>
              </Flex>
            </Card>
          </Col>

          <Col xs={24} lg={15}>
            <Spin spinning={isLoading}>
              <Space direction="vertical" size={16} className="full-width">
                <Card title="任务状态" className="panel">
                  {activeTask ? <TaskDetail task={activeTask} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />}
                </Card>

                <Card title="历史任务" className="panel">
                  <TaskList tasks={tasks} activeTaskId={activeTaskId} onSelect={setActiveTaskId} />
                </Card>
              </Space>
            </Spin>
          </Col>
        </Row>
      </main>

      <Modal open={Boolean(previewImage)} footer={null} onCancel={() => setPreviewImage('')} width={720}>
        <img className="preview-image" src={previewImage} alt="试卷预览" />
      </Modal>
    </div>
  );
}

function TaskDetail({ task }: { task: PaperTask }) {
  const meta = statusMeta[task.status];

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Flex justify="space-between" gap={12} wrap="wrap">
        <div>
          <Title level={3} className="section-title">
            {task.grade} {task.subject}
          </Title>
          <Text type="secondary">{task.statusMessage}</Text>
        </div>
        <Tag color={meta.color}>{meta.label}</Tag>
      </Flex>

      <Steps
        size="small"
        current={meta.step}
        status={task.status === 'failed' ? 'error' : undefined}
        items={[{ title: '已上传' }, { title: '等待领取' }, { title: 'PC 处理' }, { title: '完成' }]}
      />

      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
        <Descriptions.Item label="任务 ID">{task.id}</Descriptions.Item>
        <Descriptions.Item label="学生">{task.studentName || '未填写'}</Descriptions.Item>
        <Descriptions.Item label="练习题数">{task.practiceCount}</Descriptions.Item>
        <Descriptions.Item label="练习难度">{task.difficulty}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{formatTime(task.createdAt)}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{formatTime(task.updatedAt)}</Descriptions.Item>
      </Descriptions>

      {task.notes ? <Alert type="info" showIcon message={task.notes} /> : null}

      <Card size="small" title={`原始图片 ${task.images.length}`}>
        <Flex gap={8} wrap="wrap">
          {task.images.map((image) => (
            <Button key={image.id} icon={<LinkOutlined />} href={assetUrl(image.url)} target="_blank">
              {image.name}
            </Button>
          ))}
        </Flex>
      </Card>

      <Card size="small" title={`处理结果 ${task.results.length}`}>
        {task.results.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待 PC Agent 回传结果" />
        ) : (
          <List
            dataSource={task.results}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="open" type="link" href={assetUrl(item.url)} target="_blank">
                    打开
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Text strong>{item.name}</Text>
                      <Tag>{item.kind}</Tag>
                    </Space>
                  }
                  description={item.summary || formatTime(item.createdAt)}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </Space>
  );
}

function TaskList({
  tasks,
  activeTaskId,
  onSelect
}: {
  tasks: PaperTask[];
  activeTaskId: string;
  onSelect: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />;
  }

  return (
    <List
      dataSource={tasks}
      renderItem={(task) => {
        const meta = statusMeta[task.status];
        return (
          <List.Item className={task.id === activeTaskId ? 'active-task' : ''} onClick={() => onSelect(task.id)}>
            <List.Item.Meta
              avatar={<Badge color={meta.color} />}
              title={
                <Space wrap>
                  <Text strong>
                    {task.grade} {task.subject}
                  </Text>
                  <Tag color={meta.color}>{meta.label}</Tag>
                </Space>
              }
              description={`${formatTime(task.createdAt)} · ${task.images.length} 张图片 · ${task.results.length} 个结果`}
            />
          </List.Item>
        );
      }}
    />
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

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
