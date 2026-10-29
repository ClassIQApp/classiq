import { QuizError } from "../core/quiz/errors.ts";
import type { QuizDraft } from "../core/quiz/model.ts";
import { PostgresQuizRepository } from "../core/quiz/postgres-quiz-repository.ts";
import { runMigrations } from "../db/migrate.ts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testUrl = process.env.TEST_UPLOAD_DATABASE_URL;

describe.skipIf(!testUrl)("Postgres quiz persistence", () => {
    const schema = `quiz_test_${randomUUID().replaceAll("-", "")}`;
    const db = new Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    const repository = new PostgresQuizRepository(db);
    let courseId: string;
    let otherCourseId: string;
    let lectureId: string;
    let userId: string;
    let otherUserId: string;

    const draft = (overrides: Partial<QuizDraft> = {}): QuizDraft => ({
        courseId,
        lectureId,
        title: "Enzymes",
        model: "gpt-test",
        createdByUserId: userId,
        questions: [
            {
                prompt: "What do enzymes lower?",
                choices: ["Activation energy", "Heat", "Pressure", "Volume"],
                correctChoice: 0,
                explanation: "They lower activation energy.",
                sources: [{ kind: "transcript", lectureId, title: "Enzymes", startSeconds: 0, endSeconds: 42 }],
            },
            {
                prompt: "Where do inhibitors bind?",
                choices: ["Membrane", "Active site"],
                correctChoice: 1,
                explanation: "Competitive inhibitors bind the active site.",
                sources: [{ kind: "resource", resourceId: "3", title: "notes.pdf", pageNumber: 4 }],
            },
        ],
        ...overrides,
    });

    beforeAll(async () => {
        await db.query(`CREATE SCHEMA ${schema}`);

        await runMigrations(db);

        const courses = await db.query<{ id: number }>(
            "INSERT INTO courses (name, slug) VALUES ('Quiz biology', 'quiz-bio'), ('Quiz chemistry', 'quiz-chem') RETURNING id",
        );

        courseId = String(courses.rows[0]!.id);
        otherCourseId = String(courses.rows[1]!.id);

        const lectures = await db.query<{ id: number }>("INSERT INTO lectures (fk_course_id, title) VALUES ($1, 'Enzymes') RETURNING id", [
            courseId,
        ]);

        lectureId = String(lectures.rows[0]!.id);

        const users = await db.query<{ id: number }>(
            "INSERT INTO users (name, email) VALUES ('Student', 'quiz-student@test.dev'), ('Other', 'quiz-other@test.dev') RETURNING id",
        );

        userId = String(users.rows[0]!.id);
        otherUserId = String(users.rows[1]!.id);
    });

    afterAll(async () => {
        await db.query(`DROP SCHEMA ${schema} CASCADE`);

        await db.end();
    });

    it("checks whether a course or lecture exists", async () => {
        expect(await repository.scopeExists(courseId)).toBe(true);
        expect(await repository.scopeExists(courseId, lectureId)).toBe(true);
        expect(await repository.scopeExists(otherCourseId, lectureId)).toBe(false);
    });

    it("stores quizzes with ordered questions, answer keys, and source snapshots", async () => {
        const quiz = await repository.createQuiz(draft());

        expect(quiz).toMatchObject({ courseId, lectureId, title: "Enzymes", questionCount: 2 });
        expect(quiz.questions.map((question) => [question.position, question.choices, question.correctChoice])).toEqual([
            [0, ["Activation energy", "Heat", "Pressure", "Volume"], 0],
            [1, ["Membrane", "Active site"], 1],
        ]);
        expect(quiz.questions[1]!.sources).toEqual([{ kind: "resource", resourceId: "3", title: "notes.pdf", pageNumber: 4 }]);
        expect(await repository.getQuiz(courseId, quiz.id)).toEqual(quiz);
        expect(await repository.getQuiz(otherCourseId, quiz.id)).toBeUndefined();
    });

    it("lists course and lecture quizzes newest first", async () => {
        await repository.createQuiz(draft({ lectureId: undefined, title: "Course review" }));

        const all = await repository.listQuizzes(courseId);
        const lectureOnly = await repository.listQuizzes(courseId, lectureId);

        expect(all.map((quiz) => quiz.title)).toEqual(["Course review", "Enzymes"]);
        expect(lectureOnly.map((quiz) => quiz.title)).toEqual(["Enzymes"]);
        expect(await repository.listQuizzes(otherCourseId)).toEqual([]);
    });

    it("rejects a lecture from another course", async () => {
        await expect(repository.createQuiz(draft({ courseId: otherCourseId }))).rejects.toEqual(new QuizError("not_found"));
    });

    it("stores attempts per user with every answer, including unanswered ones", async () => {
        const [quiz] = await repository.listQuizzes(courseId, lectureId);
        const { questions } = (await repository.getQuiz(courseId, quiz!.id))!;

        const attempt = await repository.createAttempt({
            courseId,
            quizId: quiz!.id,
            userId,
            score: 1,
            total: 2,
            answers: [
                { questionId: questions[0]!.id, selectedChoice: 0 },
                { questionId: questions[1]!.id, selectedChoice: null },
            ],
        });

        expect(attempt).toMatchObject({ quizId: quiz!.id, userId, score: 1, total: 2 });

        const stored = await repository.getAttempt(courseId, quiz!.id, attempt.id, userId);

        expect(stored?.selectedChoices).toEqual(
            new Map([
                [questions[0]!.id, 0],
                [questions[1]!.id, null],
            ]),
        );
        expect(await repository.getAttempt(courseId, quiz!.id, attempt.id, otherUserId)).toBeUndefined();
        expect(await repository.getAttempt(otherCourseId, quiz!.id, attempt.id, userId)).toBeUndefined();
        expect(await repository.listAttempts(courseId, quiz!.id, userId)).toEqual([
            { id: attempt.id, quizId: quiz!.id, score: 1, total: 2, submittedAt: attempt.submittedAt },
        ]);
        expect(await repository.listAttempts(courseId, quiz!.id, otherUserId)).toEqual([]);
    });

    it("rejects attempts on another course's quiz or with another quiz's questions", async () => {
        const [lectureQuiz] = await repository.listQuizzes(courseId, lectureId);
        const courseQuizzes = await repository.listQuizzes(courseId);
        const courseQuiz = courseQuizzes.find((quiz) => quiz.title === "Course review")!;
        const foreign = await repository.getQuiz(courseId, courseQuiz.id);
        const foreignQuestion = foreign!.questions[0]!;

        await expect(
            repository.createAttempt({ courseId: otherCourseId, quizId: lectureQuiz!.id, userId, score: 0, total: 2, answers: [] }),
        ).rejects.toEqual(new QuizError("not_found"));
        await expect(
            repository.createAttempt({
                courseId,
                quizId: lectureQuiz!.id,
                userId,
                score: 0,
                total: 2,
                answers: [{ questionId: foreignQuestion.id, selectedChoice: 0 }],
            }),
        ).rejects.toEqual(new QuizError("invalid_attempt"));
        expect(await repository.listAttempts(courseId, lectureQuiz!.id, userId)).toHaveLength(1);
    });

    it("removes a lecture's quizzes and attempts when the lecture is deleted", async () => {
        await db.query("DELETE FROM lectures WHERE id = $1", [lectureId]);

        const remaining = await repository.listQuizzes(courseId);

        expect(remaining.map((quiz) => quiz.title)).toEqual(["Course review"]);
        expect(await db.query("SELECT 1 FROM quiz_attempts")).toMatchObject({ rowCount: 0 });
    });
});
