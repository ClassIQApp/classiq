# Evaluation harness

Compares question answering and quiz generation with no course material (A), the lecture transcript (B), and the transcript plus course documents (C), using the same model, prompts, and settings. Benchmark files and results stay outside the repository.

## Setup

1. Create an empty database, such as `classiq_eval`, and an `.env.evaluation` next to `.env.development` (it is gitignored) with `DATABASE_URL`, `LLM_PROVIDER`, the provider's API key, and its model.
2. Write a `benchmark.json` anywhere outside the repository. Paths in it are relative to the file.

```json
{
    "config": {
        "contextChars": 48000,
        "passageLimit": 40,
        "runs": 2,
        "quizRuns": 2,
        "quizQuestions": 5,
        "seed": 1,
        "pricing": { "inputPerMillion": 0.3, "outputPerMillion": 1.2 }
    },
    "lectures": [
        {
            "id": "L1",
            "title": "Enzymes",
            "topic": "Enzyme catalysis",
            "transcript": "transcripts/L1.json",
            "documents": [{ "title": "Enzyme notes", "pages": "docs/notes.json" }],
            "wer": { "reference": "wer/L1.txt", "startSeconds": 0, "endSeconds": 150 }
        }
    ],
    "questions": [{ "id": "q1", "lectureId": "L1", "category": "lecture", "question": "...", "reference": "..." }]
}
```

A transcript file is a list of `{ text, startSeconds, endSeconds }`, a document file a list of `{ text, pageNumber }`, and `category` is `lecture`, `document`, or `unanswerable`. Each lecture is ingested into its own course, so condition C searches only that lecture's documents.

## Run

```sh
pnpm --filter @classiq/api eval:run --benchmark <benchmark.json> --out <directory> --dry-run
pnpm --filter @classiq/api eval:run --benchmark <benchmark.json> --out <directory> --lecture L1
pnpm --filter @classiq/api eval:run --benchmark <benchmark.json> --out <directory>
pnpm --filter @classiq/api eval:export --benchmark <benchmark.json> --results <directory>
pnpm --filter @classiq/api eval:wer --benchmark <benchmark.json>
pnpm --filter @classiq/api eval:failures --out failure-report.md
```

- `--dry-run` counts the jobs without calling the model, and `--lecture`, `--tasks qa,quiz`, and `--conditions A,B` narrow a run, for example to pilot one lecture.
- Jobs run in a seeded random order. `results.jsonl` gets one line per call with its latency, tokens, estimated cost, the context supplied, and any error. A rerun skips finished jobs and retries failed ones, and `run-config.json` records the commit, model, budgets, and prompt versions.
- Condition B takes the whole context budget from the transcript. Condition C splits it evenly between transcript and documents.
- `eval:export` writes `scoring.csv` with the condition hidden and shuffled ids, `key.csv` to map them back after scoring, and `summary.md` with latency, tokens, context size, and cost per task and condition.
- `eval:wer` compares each lecture's transcript against its corrected reference excerpt.
- `eval:failures` runs the processing tests that inject failures and reports each scenario. Set `TEST_UPLOAD_DATABASE_URL` to a real Postgres to include the database-backed ones.
