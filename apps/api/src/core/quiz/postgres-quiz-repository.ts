import { QuizError } from "./errors.ts";
import type { AnsweredQuizQuestion, QuizAttemptSummary, QuizDraft, QuizSource, QuizSummary, QuizWithAnswers } from "./model.ts";
import type { NewQuizAttempt, QuizRepository, StoredQuizAttempt } from "./quiz-repository.ts";
import { DatabaseError, type Pool, type PoolClient } from "pg";

const QUIZ_COLUMNS = `
    quizzes.id,
    quizzes.course_id,
    quizzes.lecture_id,
    quizzes.title,
    quizzes.created_at,
    (SELECT count(*) FROM quiz_questions WHERE quiz_questions.quiz_id = quizzes.id) AS question_count
`;

interface QuizRow {
    id: number;
    course_id: number;
    lecture_id: number | null;
    title: string;
    created_at: Date;
    question_count: string;
}

interface QuestionRow {
    id: number;
    position: number;
    prompt: string;
    choices: string[];
    correct_choice: number;
    explanation: string;
    sources: QuizSource[];
}

interface AttemptRow {
    id: number;
    quiz_id: number;
    user_id: number;
    score: number;
    total: number;
    submitted_at: Date;
}

function toSummary(row: QuizRow): QuizSummary {
    return {
        id: String(row.id),
        courseId: String(row.course_id),
        ...(row.lecture_id === null ? {} : { lectureId: String(row.lecture_id) }),
        title: row.title,
        questionCount: Number(row.question_count),
        createdAt: row.created_at.toISOString(),
    };
}

function toQuestion(row: QuestionRow): AnsweredQuizQuestion {
    return {
        id: String(row.id),
        position: row.position,
        prompt: row.prompt,
        choices: row.choices,
        correctChoice: row.correct_choice,
        explanation: row.explanation,
        sources: row.sources,
    };
}

function toAttemptSummary(row: AttemptRow): QuizAttemptSummary {
    return {
        id: String(row.id),
        quizId: String(row.quiz_id),
        score: row.score,
        total: row.total,
        submittedAt: row.submitted_at.toISOString(),
    };
}

function isForeignKeyViolation(error: unknown): boolean {
    return error instanceof DatabaseError && error.code === "23503";
}

export class PostgresQuizRepository implements QuizRepository {
    private readonly db: Pool;

    constructor(db: Pool) {
        this.db = db;
    }

    async scopeExists(courseId: string, lectureId?: string): Promise<boolean> {
        const result =
            lectureId === undefined
                ? await this.db.query("SELECT 1 FROM courses WHERE id = $1", [courseId])
                : await this.db.query("SELECT 1 FROM lectures WHERE fk_course_id = $1 AND id = $2", [courseId, lectureId]);

        return Boolean(result.rowCount);
    }

    async createQuiz(draft: QuizDraft): Promise<QuizWithAnswers> {
        return this.transaction(async (client) => {
            let quizId: number;

            try {
                const result = await client.query<{ id: number }>(
                    `
                    INSERT INTO quizzes (course_id, lecture_id, title, model, created_by_user_id)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                    `,
                    [draft.courseId, draft.lectureId ?? null, draft.title, draft.model, draft.createdByUserId ?? null],
                );

                quizId = result.rows[0]!.id;
            } catch (error) {
                if (isForeignKeyViolation(error)) {
                    throw new QuizError("not_found");
                }

                throw error;
            }

            await client.query(
                `
                INSERT INTO quiz_questions (quiz_id, position, prompt, choices, correct_choice, explanation, sources)
                SELECT $1, question.position, question.prompt, ARRAY(SELECT jsonb_array_elements_text(question.choices)),
                    question.correct_choice, question.explanation, question.sources
                FROM jsonb_to_recordset($2::jsonb)
                    AS question(position int, prompt text, choices jsonb, correct_choice int, explanation text, sources jsonb)
                `,
                [
                    quizId,
                    JSON.stringify(
                        draft.questions.map((question, position) => ({
                            position,
                            prompt: question.prompt,
                            choices: question.choices,
                            correct_choice: question.correctChoice,
                            explanation: question.explanation,
                            sources: question.sources,
                        })),
                    ),
                ],
            );

            return (await this.readQuiz(client, draft.courseId, String(quizId)))!;
        });
    }

    async listQuizzes(courseId: string, lectureId?: string): Promise<QuizSummary[]> {
        const result = await this.db.query<QuizRow>(
            `
            SELECT ${QUIZ_COLUMNS}
            FROM quizzes
            WHERE course_id = $1
                AND ($2::int IS NULL OR lecture_id = $2)
            ORDER BY created_at DESC, id DESC
            `,
            [courseId, lectureId ?? null],
        );

        return result.rows.map((row) => toSummary(row));
    }

    async getQuiz(courseId: string, quizId: string): Promise<QuizWithAnswers | undefined> {
        const client = await this.db.connect();

        try {
            return await this.readQuiz(client, courseId, quizId);
        } finally {
            client.release();
        }
    }

    async createAttempt(attempt: NewQuizAttempt): Promise<StoredQuizAttempt> {
        return this.transaction(async (client) => {
            let row: AttemptRow | undefined;

            try {
                const result = await client.query<AttemptRow>(
                    `
                    INSERT INTO quiz_attempts (quiz_id, user_id, score, total)
                    SELECT id, $3, $4, $5 FROM quizzes WHERE course_id = $1 AND id = $2
                    RETURNING id, quiz_id, user_id, score, total, submitted_at
                    `,
                    [attempt.courseId, attempt.quizId, attempt.userId, attempt.score, attempt.total],
                );

                row = result.rows[0];
            } catch (error) {
                if (isForeignKeyViolation(error)) {
                    throw new QuizError("not_found");
                }

                throw error;
            }

            if (!row) {
                throw new QuizError("not_found");
            }

            try {
                await client.query(
                    `
                    INSERT INTO quiz_attempt_answers (attempt_id, quiz_id, question_id, selected_choice)
                    SELECT $1, $2, answer.question_id, answer.selected_choice
                    FROM unnest($3::int[], $4::int[]) AS answer(question_id, selected_choice)
                    `,
                    [
                        row.id,
                        row.quiz_id,
                        attempt.answers.map((answer) => answer.questionId),
                        attempt.answers.map((answer) => answer.selectedChoice),
                    ],
                );
            } catch (error) {
                if (isForeignKeyViolation(error)) {
                    throw new QuizError("invalid_attempt");
                }

                throw error;
            }

            return {
                ...toAttemptSummary(row),
                userId: String(row.user_id),
                selectedChoices: new Map(attempt.answers.map((answer) => [answer.questionId, answer.selectedChoice])),
            };
        });
    }

    async getAttempt(courseId: string, quizId: string, attemptId: string, userId: string): Promise<StoredQuizAttempt | undefined> {
        const attempts = await this.db.query<AttemptRow>(
            `
            SELECT attempt.id, attempt.quiz_id, attempt.user_id, attempt.score, attempt.total, attempt.submitted_at
            FROM quiz_attempts AS attempt
            JOIN quizzes ON quizzes.id = attempt.quiz_id
            WHERE quizzes.course_id = $1
                AND attempt.quiz_id = $2
                AND attempt.id = $3
                AND attempt.user_id = $4
            `,
            [courseId, quizId, attemptId, userId],
        );

        const row = attempts.rows[0];

        if (!row) {
            return undefined;
        }

        const answers = await this.db.query<{ question_id: number; selected_choice: number | null }>(
            "SELECT question_id, selected_choice FROM quiz_attempt_answers WHERE attempt_id = $1",
            [row.id],
        );

        return {
            ...toAttemptSummary(row),
            userId: String(row.user_id),
            selectedChoices: new Map(answers.rows.map((answer) => [String(answer.question_id), answer.selected_choice])),
        };
    }

    async listAttempts(courseId: string, quizId: string, userId: string): Promise<QuizAttemptSummary[]> {
        const result = await this.db.query<AttemptRow>(
            `
            SELECT attempt.id, attempt.quiz_id, attempt.user_id, attempt.score, attempt.total, attempt.submitted_at
            FROM quiz_attempts AS attempt
            JOIN quizzes ON quizzes.id = attempt.quiz_id
            WHERE quizzes.course_id = $1
                AND attempt.quiz_id = $2
                AND attempt.user_id = $3
            ORDER BY attempt.submitted_at DESC, attempt.id DESC
            `,
            [courseId, quizId, userId],
        );

        return result.rows.map((row) => toAttemptSummary(row));
    }

    private async readQuiz(client: PoolClient, courseId: string, quizId: string): Promise<QuizWithAnswers | undefined> {
        const quizzes = await client.query<QuizRow>(`SELECT ${QUIZ_COLUMNS} FROM quizzes WHERE course_id = $1 AND id = $2`, [
            courseId,
            quizId,
        ]);

        const row = quizzes.rows[0];

        if (!row) {
            return undefined;
        }

        const questions = await client.query<QuestionRow>(
            `
            SELECT id, position, prompt, choices, correct_choice, explanation, sources
            FROM quiz_questions
            WHERE quiz_id = $1
            ORDER BY position
            `,
            [row.id],
        );

        return { ...toSummary(row), questions: questions.rows.map((question) => toQuestion(question)) };
    }

    private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const result = await operation(client);

            await client.query("COMMIT");

            return result;
        } catch (error) {
            await client.query("ROLLBACK");

            throw error;
        } finally {
            client.release();
        }
    }
}
