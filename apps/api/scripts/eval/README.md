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

## Pull lectures from ClassIQ

Process each recording through ClassIQ first, so the stored transcript is the one every condition reuses. Then export it, with its indexed documents, into the benchmark folder. Point `SOURCE_DATABASE_URL` at the database the lecture lives in; it is only read.

```sh
SOURCE_DATABASE_URL=<url> pnpm --filter @classiq/api eval:pull --out <directory> --course 12 --lecture 40 --id L1 --topic "Database transactions" --excerpt 600-750
SOURCE_DATABASE_URL=<url> pnpm --filter @classiq/api eval:timing --lecture 40 --lecture 41 --out timing.md
```

- `eval:pull` writes `transcripts/L1.json`, one `documents/*.json` per indexed course resource (all of the course's, or only the `--resource <id>` ones), and adds or replaces the lecture in `benchmark.json`, keeping its questions. Run it once per lecture. Pages are rebuilt from the indexed passages with their overlap removed.
- `--excerpt <start>-<end>` (seconds) also writes `wer/L1.machine.txt`, the machine transcript of that window. Correct it against the audio and save it as `wer/L1.txt`; `eval:wer` fails until that file exists, so an uncorrected draft cannot pass as a reference.
- `eval:timing` reports every processing run of the given lectures (status, wall time, wall seconds per audio minute) and each stage's duration and attempts, which shows retries and failures at realistic lecture lengths.

## Run

```sh
pnpm --filter @classiq/api eval:run --benchmark <benchmark.json> --out <directory> --dry-run
pnpm --filter @classiq/api eval:run --benchmark <benchmark.json> --out <directory> --lecture L1
pnpm --filter @classiq/api eval:run --benchmark <benchmark.json> --out <directory>
pnpm --filter @classiq/api eval:export --benchmark <benchmark.json> --results <directory>
pnpm --filter @classiq/api eval:analyze --results <directory>
pnpm --filter @classiq/api eval:wer --benchmark <benchmark.json>
pnpm --filter @classiq/api eval:failures --out failure-report.md
```

- `--dry-run` counts the jobs without calling the model, and `--lecture`, `--tasks qa,quiz`, and `--conditions A,B` narrow a run, for example to pilot one lecture.
- Jobs run in a seeded random order. `results.jsonl` gets one line per call with its latency, tokens, estimated cost, the context supplied, and any error. A rerun skips finished jobs and retries failed ones, and `run-config.json` records the commit, model, budgets, and prompt versions.
- Condition B takes the whole context budget from the transcript. Condition C splits it evenly between transcript and documents.
- `eval:export` writes `scoring.csv` with the condition hidden and shuffled ids, `key.csv` to map them back after scoring, and `summary.md` with latency, tokens, context size, and cost per task and condition.
- `eval:wer` compares each lecture's transcript against its corrected reference excerpt.
- `eval:failures` runs the processing tests that inject failures and reports each scenario. Set `TEST_UPLOAD_DATABASE_URL` to a real Postgres to include the database-backed ones.

## Score and analyze

Fill in the score columns of `scoring.csv` without opening `key.csv`. Blank cells mean not scored yet and are left out of the rates.

- Question answering rows: `correctness` is `correct`, `partial`, or `incorrect`; `unsupported_claim` is `yes` or `no`; `correct_decline` is `yes` or `no` on unanswerable questions only; `source_support` is `yes` or `no` when the answer cites passages.
- Quiz rows: `single_correct`, `key_ok`, `explanation_ok`, and `supported` are `yes` or `no`, and `duplicate` is `yes` when the question repeats another one.
- `eval:analyze` joins the scores to `key.csv` and `results.jsonl` and writes `analysis.md`: question answering by condition and category (with 95% Wilson intervals on the correct rate), correct rate by lecture, quiz validity by condition and lecture, and quality against latency and cost per call and per correct answer. A quiz question is fully valid when it has a single correct answer, a correct key and explanation, support, and no duplicate.
