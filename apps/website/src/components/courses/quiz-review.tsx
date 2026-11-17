import { useAuth } from "../../api/auth/provider";
import { createQuizzesApi, quizAttemptQueryKey, type QuestionResult } from "../../api/quizzes/client";
import { useTranslation } from "../../i18n/use-translation";
import { quizErrorText, quizMessagesByLanguage, type QuizMessages } from "./quiz-messages";
import QuizSources from "./quiz-sources";
import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

interface QuizReviewProps {
    accountId: string;
    courseId: string;
    quizId: string;
    attemptId: string;
    onRetake: () => void;
    onBack: () => void;
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

interface QuestionReviewProps {
    courseId: string;
    question: QuestionResult;
    position: number;
    total: number;
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

const iconByOutcome: Record<QuestionResult["outcome"], Icon> = {
    correct: CheckCircleIcon,
    incorrect: XCircleIcon,
    unanswered: MinusCircleIcon,
};

function choiceState(question: QuestionResult, choiceIndex: number, messages: QuizMessages) {
    const isCorrect = choiceIndex === question.correctChoice;
    const isSelected = choiceIndex === question.selectedChoice;

    if (isCorrect && isSelected) {
        return { className: "quiz-choice-correct", tags: [messages.yourAnswer, messages.correctAnswer] };
    }

    if (isCorrect) {
        return { className: "quiz-choice-correct", tags: [messages.correctAnswer] };
    }

    if (isSelected) {
        return { className: "quiz-choice-incorrect", tags: [messages.yourAnswer] };
    }

    return { className: "", tags: [] };
}

function QuestionReview({ courseId, question, position, total, onOpenLecture }: QuestionReviewProps) {
    const { language } = useTranslation();
    const messages = quizMessagesByLanguage[language];
    const OutcomeIcon = iconByOutcome[question.outcome];

    return (
        <article className={`quiz-question quiz-question-${question.outcome}`}>
            <header className="quiz-question-heading">
                <span className="quiz-question-number">{messages.questionNumber(position, total)}</span>

                <span className={`quiz-outcome quiz-outcome-${question.outcome}`}>
                    <OutcomeIcon weight="fill" aria-hidden />

                    {messages.outcome[question.outcome]}
                </span>
            </header>

            <h4 className="quiz-question-prompt">{question.prompt}</h4>

            <ul className="quiz-choices">
                {question.choices.map((choice, choiceIndex) => {
                    const state = choiceState(question, choiceIndex, messages);

                    return (
                        <li key={choiceIndex} className={`quiz-choice quiz-choice-review ${state.className}`}>
                            <span>{choice}</span>

                            {state.tags.length > 0 && <span className="quiz-choice-tags">{state.tags.join(" · ")}</span>}
                        </li>
                    );
                })}
            </ul>

            {question.outcome === "unanswered" && <p className="quiz-not-answered">{messages.notAnswered}</p>}

            <section className="quiz-explanation">
                <h5>{messages.explanation}</h5>

                <p>{question.explanation}</p>
            </section>

            <QuizSources courseId={courseId} sources={question.sources} onOpenLecture={onOpenLecture} />
        </article>
    );
}

export default function QuizReview({ accountId, courseId, quizId, attemptId, onRetake, onBack, onOpenLecture }: QuizReviewProps) {
    const { language } = useTranslation();
    const messages = quizMessagesByLanguage[language];
    const { apiFetch } = useAuth();
    const api = useMemo(() => createQuizzesApi(apiFetch), [apiFetch]);

    const attempt = useQuery({
        queryKey: quizAttemptQueryKey(accountId, courseId, quizId, attemptId),
        queryFn: ({ signal }) => api.getAttempt(courseId, quizId, attemptId, signal),
        retry: false,
    });

    if (attempt.isPending) {
        return (
            <p className="quiz-status" role="status">
                {messages.loadingReview}
            </p>
        );
    }

    if (attempt.isError) {
        return (
            <div className="quiz-load-error" role="alert">
                <p>{quizErrorText(attempt.error, language, messages.reviewUnavailable)}</p>

                <button type="button" className="lecture-text-button" onClick={() => void attempt.refetch()}>
                    {messages.retry}
                </button>
            </div>
        );
    }

    const { score, total, questions } = attempt.data;
    const percent = total === 0 ? 0 : Math.round((score / total) * 100);

    return (
        <div className="quiz-review">
            <section className="quiz-score" aria-label={messages.yourScore}>
                <div>
                    <span className="quiz-score-label">{messages.yourScore}</span>

                    <p className="quiz-score-value">{messages.scoreSummary(score, total)}</p>

                    <span className="quiz-score-percent">{messages.percentCorrect(percent)}</span>
                </div>

                <div className="quiz-score-actions">
                    <button type="button" className="quiz-primary-button" onClick={onRetake}>
                        {messages.retakeQuiz}
                    </button>

                    <button type="button" className="quiz-secondary-button" onClick={onBack}>
                        {messages.backToQuiz}
                    </button>
                </div>
            </section>

            <div className="quiz-question-list">
                {questions.map((question, index) => (
                    <QuestionReview
                        key={question.id}
                        courseId={courseId}
                        question={question}
                        position={index + 1}
                        total={questions.length}
                        onOpenLecture={onOpenLecture}
                    />
                ))}
            </div>
        </div>
    );
}
