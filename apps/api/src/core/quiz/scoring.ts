import { QuizError } from "./errors.ts";
import type { AnsweredQuizQuestion, AttemptAnswer, QuestionResult, ScoredAttempt } from "./model.ts";

/**
 * Scores answers against the quiz's answer key. Questions without an answer count as unanswered;
 * answers to other quizzes' questions, repeated answers, or choices that don't exist are rejected.
 */
export function scoreAttempt(questions: readonly AnsweredQuizQuestion[], answers: readonly AttemptAnswer[]): ScoredAttempt {
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    const selected = new Map<string, number | null>();

    for (const answer of answers) {
        const question = questionsById.get(answer.questionId);

        if (!question || selected.has(answer.questionId) || (answer.choice !== null && answer.choice >= question.choices.length)) {
            throw new QuizError("invalid_attempt");
        }

        selected.set(answer.questionId, answer.choice);
    }

    const results: QuestionResult[] = questions.map((question) => {
        const selectedChoice = selected.get(question.id) ?? null;

        return {
            ...question,
            selectedChoice,
            outcome: selectedChoice === null ? "unanswered" : selectedChoice === question.correctChoice ? "correct" : "incorrect",
        };
    });

    return {
        score: results.filter((result) => result.outcome === "correct").length,
        total: results.length,
        questions: results,
    };
}
