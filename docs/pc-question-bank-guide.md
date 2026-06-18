# PC Question Bank Guide

本文档给 Windows PC Agent 使用，定义本机题库建设流水线。用户只关心黑盒效果：全自动、可长期运行、可增量扫描、可断点续跑、能稳定服务出卷。

## 1. 目标与边界

目标：

- 从用户下载到本机的混乱网盘资料中自动建立题库。
- 源文件可能是 PDF、图片、Word、压缩包或其他文档，文件夹层级未知，内容可能不是试卷。
- 全流程不依赖人工审核。
- 后续用户往源目录新增文件时，能增量扫描，只处理新增或变化文件。
- 出卷时直接读取结构化题库，不回原 PDF 现读题，不现 OCR。

边界：

- 原始源文件不上传服务器。
- 原始源文件不移动、不重命名、不物理整理。
- 不抓取百度文库、网盘或其他未授权在线内容；只处理用户本机已有文件。
- 服务器只保存任务、学生、报告和最终生成文件；PC 本机保存题库资产。

## 2. 磁盘与目录

用户 PC 只有一个 4T 的 C 盘。用户下载题库源文件的默认目录为：

```text
C:\Users\madri\Documents\questions-lib\
```

该目录是 source root，只读扫描，不作为流水线工作目录。默认工作目录为：

```text
C:\PaperAnalyzer\
```

建议目录：

```text
C:\PaperAnalyzer\
  config\
    source-roots.json
    pipeline.json
    model-routing.json
  db\
    bank.sqlite
  cache\
    pages\
    thumbs\
    ocr\
    assets\
    tmp\
  views\
  exports\
  logs\
  outputs\
```

约定：

- `source-roots.json` 保存用户资料根目录列表，默认包含 `C:\Users\madri\Documents\questions-lib`。
- `bank.sqlite` 保存索引、任务队列、题目、全文检索、AI 调用记录。
- `cache/pages` 保存必要页面图，不保存所有页面高清图，避免浪费 C 盘。
- `cache/thumbs` 保存缩略图。
- `cache/ocr` 保存 OCR 中间结果。
- `cache/assets` 保存题目图、表格、复杂公式截图。
- `views` 保存虚拟分类视图，优先用快捷方式、清单或 HTML，不复制原 PDF。
- `outputs` 保存出卷结果。

必须实现磁盘保护：

- 启动时检查 C 盘剩余空间。
- 剩余空间低于 200GB 时暂停 OCR 和页面图生成，只允许轻量扫描。
- `cache/tmp` 中间文件任务完成后自动清理。
- 不重复缓存相同 hash 的页面图或 asset。

## 3. 存储总原则

不要把 PDF、原图、大文件塞进数据库。数据库保存索引和结构化结果，文件系统保存原始文件和必要 asset。

出卷实时依赖：

- SQLite 中的题目正文、答案、解析、题型、知识点、难度。
- `cache/assets` 中的题图、公式图、表格图。

出卷实时不依赖：

- 原始 PDF。
- 现 OCR。
- 重新 AI 拆题。

原始 PDF 仅用于：

- 追溯来源。
- 算法升级后重跑。
- 修复异常题。
- 重新裁图。

## 4. SQLite 表建议

### 4.1 source_roots

```sql
create table if not exists source_roots (
  id text primary key,
  root_path text not null unique,
  enabled integer not null default 1,
  created_at text not null,
  updated_at text not null
);
```

### 4.2 source_files

```sql
create table if not exists source_files (
  id text primary key,
  root_id text not null,
  absolute_path text not null unique,
  relative_path text not null,
  ext text not null,
  size_bytes integer not null,
  mtime_ms integer not null,
  sha256 text,
  quick_fingerprint text not null,
  page_count integer,
  file_status text not null,
  document_type text,
  grade text,
  subject text,
  publisher text,
  term text,
  paper_type text,
  last_seen_at text not null,
  created_at text not null,
  updated_at text not null
);
```

`quick_fingerprint` 用于增量扫描，建议由 `absolute_path + size + mtime` 组成。`sha256` 可异步计算，不阻塞首次索引。

### 4.3 source_pages

```sql
create table if not exists source_pages (
  id text primary key,
  file_id text not null,
  page_no integer not null,
  text_plain text,
  ocr_text text,
  text_hash text,
  page_image_path text,
  thumb_path text,
  ocr_status text,
  created_at text not null,
  updated_at text not null,
  unique(file_id, page_no)
);
```

### 4.4 papers

`papers` 表示从一个源文件中识别出的一套试卷、练习卷、单元练习或准试卷。一个 PDF 可以包含 0 到多套 `papers`。

```sql
create table if not exists papers (
  id text primary key,
  source_file_id text not null,
  title text,
  grade text,
  subject text,
  publisher text,
  term text,
  paper_type text,
  page_start integer,
  page_end integer,
  orientation text,
  is_complete integer not null default 0,
  question_count integer not null default 0,
  section_count integer not null default 0,
  avg_difficulty real,
  p75_difficulty real,
  max_difficulty integer,
  hard_ratio real,
  knowledge_coverage_json text not null default '[]',
  layout_completeness real,
  answer_availability real,
  benchmark_anchor text,
  benchmark_score real,
  created_at text not null,
  updated_at text not null
);
```

### 4.5 paper_sections

```sql
create table if not exists paper_sections (
  id text primary key,
  paper_id text not null,
  source_file_id text not null,
  name text,
  question_type_name text,
  question_count integer not null default 0,
  order_no integer not null,
  page_start integer,
  page_end integer,
  created_at text not null,
  updated_at text not null
);
```

### 4.6 questions

```sql
create table if not exists questions (
  id text primary key,
  source_file_id text not null,
  paper_id text,
  section_id text,
  source_page_start integer,
  source_page_end integer,
  source_question_index integer,
  question_no text,
  grade text,
  subject text,
  publisher text,
  term text,
  question_type_name text,
  knowledge_points_json text not null default '[]',
  difficulty integer,
  difficulty_factors_json text not null default '{}',
  difficulty_reason text,
  stem_plain text,
  stem_md text,
  stem_blocks_json text not null default '[]',
  answer_md text,
  analysis_md text,
  assets_json text not null default '[]',
  source_crop_path text,
  content_hash text,
  similarity_hash text,
  content_status text not null,
  usable_for_generation integer not null default 0,
  created_at text not null,
  updated_at text not null
);
```

关系约定：

```text
source_files 1 -> n papers
papers 1 -> n paper_sections
paper_sections 1 -> n questions
```

如果某个文件不是完整试卷，但能识别出练习模块，可以创建 `paper_type = "practice-set"` 的准试卷。题目必须尽量关联到 `paper_id` 和 `section_id`；无法可靠关联时允许为空，但仍要保留 `source_file_id` 和页码。

### 4.7 ai_jobs

```sql
create table if not exists ai_jobs (
  id text primary key,
  job_type text not null,
  input_ref text not null,
  prompt_version text not null,
  model text not null,
  status text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  input_tokens integer,
  output_tokens integer,
  result_json text,
  error text,
  run_after text,
  created_at text not null,
  updated_at text not null,
  unique(job_type, input_ref, prompt_version, model)
);
```

### 4.8 pipeline_jobs

```sql
create table if not exists pipeline_jobs (
  id text primary key,
  job_type text not null,
  input_ref text not null,
  status text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error text,
  run_after text,
  created_at text not null,
  updated_at text not null,
  unique(job_type, input_ref)
);
```

## 5. 状态设计

文件状态：

```text
indexed
hashed
metadata_extracted
text_extracted
ocr_planned
ocr_done
classified
question_split
stored
failed
skipped
```

题目内容状态：

```text
extracted       已抽到题目片段
structured      已结构化题干
answer_linked   已匹配答案
diagram_linked  已关联必要图形/表格/公式 asset
ready           可直接用于出卷
needs_solving   可用但需要出卷前由模型补答案或校验
raw_fragment    片段保留，不直接出卷
disabled        自动判定不可用或用户后续禁用
```

不要使用 `pending-review` 作为核心状态。系统不以人工审核为前提。

`usable_for_generation = 1` 的最低要求：

- `stem_md` 存在。
- 年级和学科存在。
- 题型存在。
- 难度存在，范围 1-10。
- 若题目依赖图形、表格或复杂公式，必须有可用 asset。
- 有 `answer_md`，或 `content_status = needs_solving` 且出卷前可自动求解校验。

## 6. 启动优先级

为了尽快验证完整系统可用性，第一轮建库采用“优先冲刺 + 后台不停跑”策略。

优先范围：

```json
{
  "priorityGradeTerms": [
    { "grade": "小学五年级", "term": "下册", "shortName": "五下" },
    { "grade": "小学六年级", "term": "上册", "shortName": "六上" }
  ],
  "prioritySubjects": ["语文", "数学", "英语"],
  "targetPaperCountPerGradeSubject": 10,
  "firstBenchmarkAnchor": "D5"
}
```

调度要求：

1. 扫描仍然覆盖整个 source root，不只扫优先范围。
2. 文件分类阶段优先识别路径、文件名或内容中命中“五下、六上、五年级下、六年级上、小学五年级下册、小学六年级上册”和语文/数学/英语的文件。
3. 拆题阶段优先处理上述范围内的完整试卷、单元练习、期中期末卷和带答案练习。
4. 对每个 `grade + term + subject`，优先沉淀约 10 套可用 `papers` 的题目体量。
5. 达到约 10 套后，立即开始为该范围寻找 `D5` 基准卷候选。
6. 找到 D5 候选后，不停止 worker；该范围降为普通优先级，继续处理其他文件和其他年级学科。
7. 不要因为某个范围暂时不足 10 套而阻塞全局；记录缺口，继续处理其他优先范围。

D5 基准卷候选规则：

- 来源必须是已结构化的 `papers`，不是文件级猜测。
- `grade`、`term`、`subject` 明确。
- `paper_type` 优先选择完整试卷、期中/期末、单元测试、综合练习。
- `question_count` 合理，题型模块较完整。
- 平均难度接近 5，且整卷有基础题、中档题和少量提高题。
- `answer_availability` 越高越优先。
- 与已选候选重复度低。

每个范围保存 D5 Top 3 候选：

```json
{
  "grade": "小学五年级",
  "term": "下册",
  "subject": "数学",
  "anchor": "D5",
  "candidates": [
    { "paperId": "paper_001", "score": 0.92 },
    { "paperId": "paper_019", "score": 0.88 },
    { "paperId": "paper_102", "score": 0.84 }
  ]
}
```

## 7. 增量扫描

每次扫描 source root 时：

1. 递归遍历文件。
2. 记录 `absolute_path`、`relative_path`、`ext`、`size_bytes`、`mtime_ms`。
3. 生成 `quick_fingerprint`。
4. 如果数据库中不存在，插入 `source_files`，创建后续 pipeline jobs。
5. 如果存在且 `quick_fingerprint` 未变化，只更新 `last_seen_at`，不重复处理。
6. 如果存在但 `quick_fingerprint` 变化，标记为 changed，重新计算 hash 和后续抽取。
7. 扫描结束后，长期未见的文件标记为 `missing`，不要立刻删除记录。

必须支持用户后续新增文件：

```text
paper-bank scan --root "C:\Users\<user>\Downloads\网盘资料"
```

同一个命令可以每天跑、每小时跑或开机后跑，不应重复消耗 AI token。

## 8. 全自动与断点续跑

所有处理都必须通过 `pipeline_jobs` 和 `ai_jobs` 调度。

要求：

- 一个文件失败不影响其他文件。
- 一个页面 OCR 失败不影响同文件其他页面。
- 一个 AI job 失败后按退避策略重试。
- 达到最大重试仍失败时标记 `failed`，写错误日志，继续处理其他 job。
- 程序退出或电脑重启后，从 `status in ('pending','retry_waiting','running timeout')` 的 job 继续。
- 每个 job 必须幂等，重复执行不能制造重复题目。

建议命令：

```powershell
paper-bank scan --all
paper-bank worker --forever
paper-bank status
paper-bank vacuum-cache
paper-bank build-views
```

`worker --forever` 不代表永不退出，而是长期循环取任务。异常必须被捕获并写入日志。

## 9. 是否整理源文件

不要物理整理源文件。不要移动、复制、重命名用户从网盘下载的原始资料。

原因：

- 原始路径是来源证据。
- 物理移动会破坏增量扫描和断点续跑。
- 一个文件可能有多个标签，物理目录只能表达一个分类。
- 大量复制会浪费 C 盘空间。

如果用户希望浏览整齐，生成虚拟视图：

```text
C:\PaperAnalyzer\views\
  小学五年级\
    数学\
      期末试卷\
        file-name.pdf.lnk
        index.html
```

虚拟视图可以是：

- Windows 快捷方式 `.lnk`。
- HTML 索引。
- CSV/XLSX 清单。
- 不复制原文件。

## 10. 内容表示与格式保真

题目不能只保存纯文本。每道题至少保存多种表示：

```json
{
  "stemPlain": "用于搜索和去重的纯文本",
  "stemMd": "用于出卷展示的 Markdown + LaTeX + asset 引用",
  "stemBlocks": [
    { "type": "paragraph", "text": "计算：" },
    { "type": "math", "latex": "\\frac{3}{4}+\\frac{2}{5}" },
    { "type": "image", "assetId": "asset_001" }
  ],
  "sourceCropPath": "cache/assets/q_001_source.png",
  "assets": ["asset_001"]
}
```

规则：

- `stem_plain` 只用于搜索、去重、召回，不作为最终排版唯一来源。
- `stem_md` 是默认组卷内容。
- `stem_blocks_json` 保留结构化块，便于后续重新渲染。
- `source_crop_path` 保存原题裁剪图，作为视觉兜底。
- 分数、根号、上下标等数学格式优先转 LaTeX。
- 不能稳定识别为 LaTeX 的复杂公式，裁成公式图片 asset。
- 图形题、表格题、阅读材料题必须保留必要 asset 或整题裁剪图。
- 加粗、下划线、特殊标点能保留则保留；不能可靠保留时，以原题裁剪图兜底。

Markdown 示例：

```md
计算：$\frac{3}{4}+\frac{2}{5}$。

![图1](assets/q_123_diagram_1.png)
```

## 11. OCR 与 AI 调用策略

可以接受较大 token 消耗，但不能无结构地烧 token。AI 调用必须可追踪、可重跑、可缓存。

处理粒度：

- 文件分类：文件名 + 路径 + 前几页文本/缩略信息。
- 页面 OCR 修复：按页。
- 模块识别：按连续页或题型块。
- 单题结构化：按题。
- 答案匹配：按模块或题。
- 知识点和难度：按题。

不要把整份长 PDF 一次丢给模型。

模型路由建议：

- 文件分类：便宜快模型。
- OCR 文本修复：便宜快模型。
- 拆题结构化：中等模型。
- 数学答案校验、复杂推理、难度评分：较强模型。
- 最终出卷：较强模型。

所有 AI 结果写入 `ai_jobs.result_json`，并同步落到业务表。prompt 版本升级后，可以只重跑受影响的 job。

## 12. 难度字段与出卷逻辑

难度只表示学生做题的难易程度，范围 1-10。不要把难度和识别质量、置信度混淆。

难度定义：

- `1-2`：基础识记、直接套公式、单知识点。
- `3-4`：常规校内题，轻微变形，1-2 步。
- `5-6`：中等综合，需要审题转换或多个知识点。
- `7-8`：拔高题，多步骤、多条件，易错点明显。
- `9`：压轴或综合探究，解法选择要求高。
- `10`：竞赛或强区分度题。

出卷时难度不是硬过滤条件。它用于控制整张卷子的难度分布和坡度。

练习强度建议：

```json
{
  "基础巩固": { "1-2": 20, "3-4": 55, "5-6": 20, "7-8": 5, "9-10": 0 },
  "常规提升": { "1-2": 5, "3-4": 25, "5-6": 50, "7-8": 18, "9-10": 2 },
  "拔高训练": { "1-2": 0, "3-4": 10, "5-6": 35, "7-8": 45, "9-10": 10 },
  "挑战压轴": { "1-2": 0, "3-4": 5, "5-6": 20, "7-8": 45, "9-10": 30 }
}
```

选题评分应综合：

- 知识点匹配。
- 题型匹配。
- 当前模块数量要求。
- 难度分布缺口。
- 学生薄弱点。
- 最近是否做过相似题。
- 内容是否可直接生成。
- 答案和 asset 是否完整。

针对学生时：

- 薄弱知识点先用低一档到同档难度建立练习坡度。
- 已掌握知识点可提高一档做迁移。
- 一张卷子前中后要有坡度，不要全是同一难度。

## 13. 默认模板与基准卷

默认模板：

- 每个年级×学科至少一套标准版式。
- 默认横版：`orientation = "landscape"`。
- 模板只保存模块、题型、数量、顺序，不保存具体题目。
- 题型名称只保存名称，不写 `学科 · 题型`。

基准卷：

- 每个年级×学科长期目标准备 D3、D5、D7、D10 四套。
- 基准卷用于校准难度，不要求一次性全覆盖。
- 优先从已经识别出的高质量结构化试卷中自动挑选候选。
- 大模型生成的基准卷必须经过自动答案校验和难度一致性校验。
- 首轮优先为“五下、六上 × 语文/数学/英语”寻找 D5 基准卷候选，找到候选后继续后台处理全库。

## 14. 出卷读取规则

出卷时：

1. 读取 SQLite 题目。
2. 读取 `cache/assets` 中已存在的题图、公式图、表格图。
3. 根据模板模块、题型数量、知识点、难度分布选题。
4. 对 `needs_solving` 题目做出卷前自动求解校验。
5. 生成 Markdown、DOCX、PDF、答案文件。
6. 上传最终文件到服务器。

禁止：

- 出卷时打开原 PDF 重新找题。
- 出卷时临时 OCR 原 PDF。
- 出卷时因为缺题而硬塞 `raw_fragment`。

如果题库不足：

- 降低相似度限制。
- 放宽难度分布。
- 使用 `needs_solving` 并现场校验答案。
- 使用模型生成变式题，并记录来源为 `generated`。

## 15. 最小实现顺序

第一版按这个顺序实现：

1. 初始化 `C:\PaperAnalyzer` 工作目录和 `bank.sqlite`。
2. 实现 source root 配置。
3. 实现增量文件扫描和 `source_files`。
4. 实现 PDF 页数、可复制文本抽取和缩略图。
5. 实现 AI 文件分类 job。
6. 实现 OCR job，只对需要 OCR 的页运行。
7. 实现 `papers`、`paper_sections`、`questions` 的关联入库。
8. 实现五下、六上 × 语文/数学/英语优先队列。
9. 实现 asset 裁剪和 `stem_md` 引用。
10. 实现难度/知识点标注。
11. 实现从 `papers` 聚合试卷画像。
12. 实现 D5 基准卷候选选择。
13. 实现虚拟视图生成。
14. 实现出卷检索 API 或本地函数。
15. 接入 `practice-generation` Skill。

不要等全库处理完才接出卷。只要有一批 `ready` 题，就可以先服务出卷。

## 16. 验收标准

PC Agent 完成题库流水线第一版时，应报告：

- `C:\PaperAnalyzer` 工作目录已创建。
- 默认 source root 已配置为 `C:\Users\madri\Documents\questions-lib`。
- `bank.sqlite` schema 已初始化。
- 已配置 source root。
- 增量扫描重复运行不会重复入库。
- 随机新增一个文件后，只处理新增文件。
- 中断 worker 后重启能继续处理。
- 源文件没有被移动或重命名。
- 能生成虚拟分类视图。
- 至少从一个 PDF 中结构化出题目。
- 题目包含 `stem_plain`、`stem_md`、来源文件、页码、`paper_id`、`section_id`、题型、难度。
- 公式或图形题有 LaTeX 或 asset 兜底。
- 出卷时未读取原 PDF、未现 OCR。
- 五下、六上 × 语文/数学/英语进入优先队列。
- 至少一个优先范围形成约 10 套 `papers` 的题目体量，或报告当前缺口。
- 至少一个优先范围产出 D5 基准卷候选 Top 3，或报告当前缺口。
- 达成优先范围目标后，worker 仍继续处理全库，不能自动停机。
