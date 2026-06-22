# Question Bank Pipeline Current State

This document records the current local question-bank pipeline for `C:\PaperAnalyzer` and the server-side progress view in this repository.

## Current State

The first full local scan has finished. Unless new source files are added, the pipeline should not repeat broad source scanning, OCR planning, OCR execution, or source-file maintenance as routine work.

The current main job is to process existing question-bank rows and move non-ready rows toward `ready`.

## Pipeline Shape

The pipeline is split into five layers:

1. Source intake
2. OCR and text extraction
3. Question structuring
4. AI completion black box
5. Ready-bank sync and practice generation

For the current phase, layers 1-3 are treated as completed for the first source wave. Layer 4 is intentionally represented as a black box because Codex capacity is currently constrained.

## Source Intake

Source files live outside the server and outside git. The default source root is:

```text
C:\Users\madri\Documents\questions-lib
```

The local working directory is:

```text
C:\PaperAnalyzer
```

Rules:

- Do not move, rename, or delete source files.
- Do not upload raw source files to the server.
- Store source paths, hashes, page metadata, extracted text, questions, and progress in the local SQLite database.
- Use the filesystem only for raw source files and necessary cached assets.

## Incremental Files

If the user adds new files later, run the intake path only for new or changed files:

```powershell
python C:\PaperAnalyzer\bin\paper-bank.py scan --all
```

Then queue and run only the required downstream work for those new files:

- metadata and hash jobs for newly discovered files,
- text extraction for new PDFs or documents,
- OCR only when a new or changed file has no usable embedded text,
- question splitting and asset extraction only for new or changed source material.

The scan is incremental. Existing unchanged files should only update `last_seen_at` and must not consume AI budget again.

## No-New-File Mode

When no files have been added or changed, do not run broad scan, OCR, enqueue-ocr, reset-stale, or worker patrol tasks as routine work.

The expected loop is:

1. Read current local question-bank counts from `C:\PaperAnalyzer\db\bank.sqlite`.
2. Export balanced `needs_solving` candidates.
3. Send candidates through the AI completion black box.
4. Validate result JSON.
5. Import high-confidence ready results.
6. Postprocess and rebuild local dashboard.
7. Sync progress to the server.

## AI Completion Black Box

For now, treat the AI layer as:

```text
non-ready usable question -> ready question
```

The black box is responsible for:

- cleaning minor OCR artifacts in stems,
- solving the question,
- writing concrete `answerMd` and `analysisMd`,
- assigning `knowledgePoints`,
- assigning `difficulty` and `difficultyReason`,
- correcting `questionTypeName`,
- skipping unrecoverable items instead of inventing placeholders.

The black box must never bulk-fill generic answers. Every ready row must be independently usable for paper generation.

## Quality Gates

Before import, result JSON must pass:

- schema validation,
- duplicate question-id check,
- exact scan for `???`,
- exact scan for mojibake markers and source-answer markers,
- DB existence/status check.

After import:

- postprocess must leave rows in `ready`,
- strict bad counts must remain zero,
- dashboard and server progress sync must use the latest ready counts.

## Server Progress Contract

The server receives progress at:

```text
POST /api/bank-progress
```

The server page reads:

```text
GET /api/bank-progress
```

The preferred payload includes both legacy flat summaries and the new subject-module structure:

```json
{
  "source": "home-pc",
  "generatedAt": "2026-06-22T12:00:00+08:00",
  "counters": {
    "totalQuestions": 15022,
    "readyQuestions": 15022,
    "needsSolvingQuestions": 151671
  },
  "bySubject": [
    { "name": "数学", "count": 12626 }
  ],
  "byGrade": [
    { "name": "小学六年级", "count": 6349 }
  ],
  "byQuestionType": [
    { "name": "填空题", "count": 6183 }
  ],
  "subjectModules": [
    {
      "subject": "数学",
      "questionTypes": ["填空题", "选择题", "判断题", "应用题"],
      "readyTotal": 12626,
      "needsSolvingTotal": 100000,
      "rows": [
        {
          "label": "小学六年级 上册",
          "grade": "小学六年级",
          "term": "上册",
          "readyByType": {
            "填空题": 2355,
            "选择题": 1198
          },
          "needsSolvingByType": {
            "综合题": 61106
          },
          "readyTotal": 5544,
          "needsSolvingTotal": 90000
        }
      ]
    }
  ]
}
```

The UI should render one module per subject. Inside each module, rows are `grade + term`, and columns are only the question types available in that subject.

## Practice Generation Dependency

Practice generation should use only structured local bank rows. It must not open raw PDFs, re-run OCR, or search source folders at generation time.

If the bank lacks enough ready questions:

- relax similarity and difficulty constraints first,
- use `needs_solving` only through the AI completion black box,
- generate variants only as a last resort and record the source as generated.

