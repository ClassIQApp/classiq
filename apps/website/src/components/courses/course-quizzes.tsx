import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import {
    createQuizzesApi,
    quizAttemptQueryKey,
    quizAttemptsQueryKey,
    quizQueryKey,
    quizzesQueryKey,
    type QuizAnswer,
    type QuizSummary,
} from "../../api/quizzes/client";
import { useTranslation } from "../../i18n/use-translation";
import { localeByLanguage, quizErrorText, quizMessagesByLanguage } from "./quiz-messages";
import QuizReview from "./quiz-review";
import QuizTaker from "./quiz-taker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

interface CourseQuizzesProps {
    courseId: string;
    lectures: Lecture[];
    canManage: boolean;
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

type QuizzesApi = ReturnType<typeof createQuizzesApi>;

interface QuizzesPanelProps extends CourseQuizzesProps {
    accountId: string;
    api: QuizzesApi;
}

interface QuizGeneratorProps {
    lectures: Lecture[];
    generating: boolean;
    error: string;
    onGenerate: (lectureId: string | undefined, questionCount: number) => void;
}

interface QuizDetailProps {
    accountId: string;
    courseId: string;
    quizId: string;
    lectures: Lecture[];
    api: QuizzesApi;
    onStart: () => void;
    onReview: (attemptId: string) => void;
    onBack: () => void;
}

type QuizView =
    | { name: "list" }
    | { name: "detail"; quizId: string }
    | { name: "taking"; quizId: string }
    | { name: "review"; quizId: string; attemptId: string };

const questionCountOptions = [3, 5, 8, 10, 15];

const defaultQuestionCount = 5;

function useQuizScope(lectures: Lecture[]) {
    const { language } = useTranslation();
    const messages = quizMessagesByLanguage[language];

    return (lectureId?: string) => {
        if (!lectureId) {
            return messages.entireCourse;
        }

        return lectures.find((lecture) => lecture.id === lectureId)?.title ?? messages.lectureFallback;
    };
}

export default function CourseQuizzes(props: CourseQuizzesProps) {
    const { state, apiFetch } = useAuth();
    const api = useMemo(() => createQuizzesApi(apiFetch), [apiFetch]);

    if (state.status !== "authenticated") {
        return null;
    }

    return <QuizzesPanel key={`${state.user.id}:${props.courseId}`} {...props} accountId={state.user.id} api={api} />;
}

function QuizGenerator({ lectures, generating, error, onGenerate }: QuizGeneratorProps) {
    const { language } = useTranslation();
    const messages = quizMessagesByLanguage[language];
    const [lectureId, setLectureId] = useState("");
    const [questionCount, setQuestionCount] = useState(defaultQuestionCount);

    return (
        <section className="quiz-generate">
            <div className="quiz-generate-info">
                <h3>{messages.generateTitle}</h3>

                <p>{messages.generateDescription}</p>
            </div>

            <div className="quiz-generate-actions">
                <label htmlFor="quiz-scope">
                    <span>{messages.scope}</span>

                    <select id="quiz-scope" value={lectureId} disabled={generating} onChange={(event) => setLectureId(event.target.value)}>
                        <option value="">{messages.entireCourse}</option>

                        {lectures.map((lecture) => (
                            <option key={lecture.id} value={lecture.id}>
                                {lecture.title}
                            </option>
                        ))}
                    </select>
                </label>

                <label htmlFor="quiz-question-count">
                    <span>{messages.questionCountLabel}</span>

                    <select
                        id="quiz-question-count"
                        value={questionCount}
                        disabled={generating}
                        onChange={(event) => setQuestionCount(Number(event.target.value))}
                    >
                        {questionCountOptions.map((count) => (
                            <option key={count} value={count}>
                                {count}
                            </option>
                        ))}
                    </select>
                </label>

                <button
                    type="button"
                    className="quiz-primary-button"
                    disabled={generating}
                    onClick={() => onGenerate(lectureId || undefined, questionCount)}
                >
                    {generating ? messages.generating : messages.generateQuiz}
                </button>
            </div>

            {error && (
                <p className="quiz-error" role="alert">
                    {error}
                </p>
            )}
        </section>
    );
}

function QuizDetail({ accountId, courseId, quizId, lectures, api, onStart, onReview, onBack }: QuizDetailProps) {
    const { language } = useTranslation();
    const messages = quizMessagesByLanguage[language];
    const scopeOf = useQuizScope(lectures);

    const quiz = useQuery({
        queryKey: quizQueryKey(accountId, courseId, quizId),
        queryFn: ({ signal }) => api.get(courseId, quizId, signal),
        retry: false,
    });

    const attempts = useQuery({
        queryKey: quizAttemptsQueryKey(accountId, courseId, quizId),
        queryFn: ({ signal }) => api.listAttempts(courseId, quizId, signal),
        retry: false,
    });

    return (
        <section className="quiz-panel">
            <header className="quiz-panel-header">
                <button type="button" className="lecture-text-button" onClick={onBack}>
                    {messages.allQuizzes}
                </button>

                {quiz.data && (
                    <>
                        <span className="quiz-scope">{scopeOf(quiz.data.lectureId)}</span>

                        <h3>{quiz.data.title}</h3>

                        <p className="quiz-meta">{messages.questionCount(quiz.data.questionCount)}</p>
                    </>
                )}
            </header>

            {quiz.isPending && (
                <p className="quiz-status" role="status">
                    {messages.loadingQuiz}
                </p>
            )}

            {quiz.isError && (
                <div className="quiz-load-error" role="alert">
                    <p>{quizErrorText(quiz.error, language, messages.quizUnavailable)}</p>

                    <button type="button" className="lecture-text-button" onClick={() => void quiz.refetch()}>
                        {messages.retry}
                    </button>
                </div>
            )}

            {quiz.data && (
                <div className="quiz-start">
                    <button type="button" className="quiz-primary-button" onClick={onStart}>
                        {attempts.data && attempts.data.length > 0 ? messages.retakeQuiz : messages.startQuiz}
                    </button>
                </div>
            )}

            <section className="quiz-attempts" aria-label={messages.attemptHistory}>
                <h4>{messages.attemptHistory}</h4>

                {attempts.isPending && (
                    <p className="quiz-status" role="status">
                        {messages.loadingAttempts}
                    </p>
                )}

                {attempts.isError && (
                    <div className="quiz-load-error" role="alert">
                        <p>{quizErrorText(attempts.error, language, messages.attemptsUnavailable)}</p>

                        <button type="button" className="lecture-text-button" onClick={() => void attempts.refetch()}>
                            {messages.retry}
                        </button>
                    </div>
                )}

                {attempts.isSuccess && attempts.data.length === 0 && <p className="quiz-status">{messages.noAttempts}</p>}

                {attempts.isSuccess && attempts.data.length > 0 && (
                    <ul className="quiz-attempt-list">
                        {attempts.data.map((attempt) => (
                            <li key={attempt.id} className="quiz-attempt">
                                <span className="quiz-attempt-score">{messages.attemptScore(attempt.score, attempt.total)}</span>

                                <span className="quiz-attempt-date">
                                    {new Date(attempt.submittedAt).toLocaleString(localeByLanguage[language], {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                    })}
                                </span>

                                <button type="button" className="quiz-secondary-button" onClick={() => onReview(attempt.id)}>
                                    {messages.reviewAttempt}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </section>
    );
}

function QuizzesPanel({ courseId, lectures, canManage, onOpenLecture, accountId, api }: QuizzesPanelProps) {
    const { language } = useTranslation();
    const messages = quizMessagesByLanguage[language];
    const queryClient = useQueryClient();
    const scopeOf = useQuizScope(lectures);
    const [view, setView] = useState<QuizView>({ name: "list" });

    const quizzes = useQuery({
        queryKey: quizzesQueryKey(accountId, courseId),
        queryFn: ({ signal }) => api.list(courseId, signal),
        retry: false,
    });

    const takingQuizId = view.name === "taking" ? view.quizId : undefined;

    const takingQuiz = useQuery({
        queryKey: quizQueryKey(accountId, courseId, takingQuizId ?? "none"),
        queryFn: ({ signal }) => api.get(courseId, takingQuizId!, signal),
        enabled: takingQuizId !== undefined,
        retry: false,
    });

    const generate = useMutation({
        mutationFn: (request: { lectureId?: string; questionCount: number }) =>
            api.generate(courseId, request.lectureId, request.questionCount),
        onSuccess: async (quiz) => {
            await queryClient.invalidateQueries({ queryKey: quizzesQueryKey(accountId, courseId) });
            setView({ name: "detail", quizId: quiz.id });
        },
    });

    const submit = useMutation({
        mutationFn: (request: { quizId: string; answers: QuizAnswer[] }) => api.submit(courseId, request.quizId, request.answers),
        onSuccess: async (attempt) => {
            queryClient.setQueryData(quizAttemptQueryKey(accountId, courseId, attempt.quizId, attempt.id), attempt);
            await queryClient.invalidateQueries({ queryKey: quizAttemptsQueryKey(accountId, courseId, attempt.quizId) });
            setView({ name: "review", quizId: attempt.quizId, attemptId: attempt.id });
        },
    });

    const showList = () => setView({ name: "list" });

    const showDetail = (quizId: string) => setView({ name: "detail", quizId });

    function startQuiz(quizId: string) {
        submit.reset();
        setView({ name: "taking", quizId });
    }

    function renderQuizCard(quiz: QuizSummary) {
        return (
            <li key={quiz.id}>
                <button type="button" className="quiz-card" onClick={() => showDetail(quiz.id)}>
                    <span className="quiz-card-title">{quiz.title}</span>

                    <span className="quiz-card-scope">{scopeOf(quiz.lectureId)}</span>

                    <span className="quiz-card-meta">
                        <span>{messages.questionCount(quiz.questionCount)}</span>

                        <span>{new Date(quiz.createdAt).toLocaleDateString(localeByLanguage[language])}</span>
                    </span>
                </button>
            </li>
        );
    }

    function renderView() {
        if (view.name === "detail") {
            return (
                <QuizDetail
                    accountId={accountId}
                    courseId={courseId}
                    quizId={view.quizId}
                    lectures={lectures}
                    api={api}
                    onStart={() => startQuiz(view.quizId)}
                    onReview={(attemptId) => setView({ name: "review", quizId: view.quizId, attemptId })}
                    onBack={showList}
                />
            );
        }

        if (view.name === "taking") {
            if (takingQuiz.isPending) {
                return (
                    <p className="quiz-status" role="status">
                        {messages.loadingQuiz}
                    </p>
                );
            }

            if (takingQuiz.isError) {
                return (
                    <div className="quiz-load-error" role="alert">
                        <p>{quizErrorText(takingQuiz.error, language, messages.quizUnavailable)}</p>

                        <button type="button" className="lecture-text-button" onClick={() => void takingQuiz.refetch()}>
                            {messages.retry}
                        </button>
                    </div>
                );
            }

            return (
                <QuizTaker
                    key={takingQuiz.data.id}
                    quiz={takingQuiz.data}
                    submitting={submit.isPending}
                    error={submit.isError ? quizErrorText(submit.error, language, messages.submitFailed) : ""}
                    onSubmit={(answers) => submit.mutate({ quizId: view.quizId, answers })}
                    onCancel={() => showDetail(view.quizId)}
                />
            );
        }

        if (view.name === "review") {
            return (
                <section className="quiz-panel">
                    <QuizReview
                        accountId={accountId}
                        courseId={courseId}
                        quizId={view.quizId}
                        attemptId={view.attemptId}
                        onRetake={() => startQuiz(view.quizId)}
                        onBack={() => showDetail(view.quizId)}
                        onOpenLecture={onOpenLecture}
                    />
                </section>
            );
        }

        return (
            <section className="quiz-panel">
                <header className="quiz-list-heading">
                    <h3>{messages.availableQuizzes}</h3>

                    {quizzes.data && <span>{messages.quizCount(quizzes.data.length)}</span>}
                </header>

                {quizzes.isPending && (
                    <p className="quiz-status" role="status">
                        {messages.loadingQuizzes}
                    </p>
                )}

                {quizzes.isError && (
                    <div className="quiz-load-error" role="alert">
                        <p>{quizErrorText(quizzes.error, language, messages.quizzesUnavailable)}</p>

                        <button type="button" className="lecture-text-button" onClick={() => void quizzes.refetch()}>
                            {messages.retry}
                        </button>
                    </div>
                )}

                {quizzes.isSuccess && quizzes.data.length === 0 && (
                    <div className="quiz-empty">
                        <h4>{messages.noQuizzesYet}</h4>

                        <p>{canManage ? messages.noQuizzesTeacher : messages.noQuizzesMember}</p>
                    </div>
                )}

                {quizzes.isSuccess && quizzes.data.length > 0 && (
                    <ul className="quiz-card-list">{quizzes.data.map((quiz) => renderQuizCard(quiz))}</ul>
                )}
            </section>
        );
    }

    return (
        <section className="quizzes-container" aria-label={messages.ariaLabel}>
            <header className="quizzes-header">
                <h2>{messages.title}</h2>

                <p>{messages.description}</p>
            </header>

            {canManage && view.name === "list" && (
                <QuizGenerator
                    lectures={lectures}
                    generating={generate.isPending}
                    error={generate.isError ? quizErrorText(generate.error, language, messages.generationFailed) : ""}
                    onGenerate={(lectureId, questionCount) => generate.mutate({ lectureId, questionCount })}
                />
            )}

            {renderView()}
        </section>
    );
}
