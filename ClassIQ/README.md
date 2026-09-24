# Live Lecture Interpreter

First MVP for the AI live lecture assistant.

## Requirements

- Node.js 20+
- Docker Desktop

## Start PostgreSQL

```bash
docker compose up -d
```

## Install

```bash
npm install
```

Copy:

```text
apps/api/.env.example
```

to:

```text
apps/api/.env
```

## Run

```bash
npm run dev
```

Open:

http://localhost:5173

API:

http://localhost:4000/health

## Current MVP

- React + TypeScript frontend
- Node.js + Express API
- PostgreSQL schema
- Lecture setup
- Material upload endpoint
- Live lecture UI
- Basic transcript/AI demonstration flow

## Next integrations

1. AWS S3 for permanent file storage
2. Real speech-to-text
3. LLM API
4. Material text extraction/RAG
5. SQS processing
6. API Gateway + Lambda deployment
7. Authentication
8. Real-time transcript delivery
