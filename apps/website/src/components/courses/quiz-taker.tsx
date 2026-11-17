import type { Quiz, QuizAnswer } from "../../api/quizzes/client";
import { useTranslation } from "../../i18n/use-translation";
import { quizMessagesByLanguage } from "./quiz-messages";
import { useState } from "react";

interface QuizTakerProps {
    quiz: Quiz;
    submitting: boolean;
    error: string;
    onSubmit: (answers: QuizAnswer[]) => void;
    onCancel: () => void;
}

export default function QuizTaker({ quiz, submitting, error, onSubmit, onCancel }: QuizTakerProps) {
    const { language } = useTranslation();
    const messages = quizMessagesByLanguage[language];
    const [choiceByQuestionId, setChoiceByQuestionId] = useState<Record<string, number>>({});

    const answered = Object.keys(choiceByQuestionId).length;
    const unanswered = quiz.questions.length - answered;

    function submit() {
        onSubmit(quiz.questions.map((question) => ({ questionId: question.id, choice: choiceByQuestionId[question.id] ?? null })));
    }

    return (
        <form
            className="quiz-taker"
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <header className="quiz-panel-header">
                <button type="button" className="lecture-text-button" disabled={submitting} onClick={onCancel}>
                    {messages.backToQuiz}
                </button>

                <h3>{quiz.title}</h3>

                <p className="quiz-progress" role="status">
                    {messages.answeredCount(answered, quiz.questions.length)}
                </p>
            </header>

            <ol className="quiz-question-list">
                {quiz.questions.map((question, index) => (
                    <li key={question.id}>
                        <fieldset className="quiz-question" disabled={submitting}>
                            <legend>
                                <span className="quiz-question-number">{messages.questionNumber(index + 1, quiz.questions.length)}</span>

                                <span className="quiz-question-prompt">{question.prompt}</span>
                            </legend>

                            <div className="quiz-choices">
                                {question.choices.map((choice, choiceIndex) => (
                                    <label
                                        key={choiceIndex}
                                        className={
                                            choiceByQuestionId[question.id] === choiceIndex
                                                ? "quiz-choice quiz-choice-selected"
                                                : "quiz-choice"
                                        }
                                    >
                                        <input
                                            type="radio"
                                            name={`quiz-question-${question.id}`}
                                            checked={choiceByQuestionId[question.id] === choiceIndex}
                                            onChange={() =>
                                                setChoiceByQuestionId((current) => ({ ...current, [question.id]: choiceIndex }))
                                            }
                                        />

                                        <span>{choice}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    </li>
                ))}
            </ol>

            {error && (
                <p className="quiz-error" role="alert">
                    {error}
                </p>
            )}

            <footer className="quiz-submit-bar">
                <p>{unanswered > 0 ? messages.unansweredNotice(unanswered) : messages.answeredCount(answered, quiz.questions.length)}</p>

                <button type="submit" className="quiz-primary-button" disabled={submitting}>
                    {submitting ? messages.submitting : messages.submitQuiz}
                </button>
            </footer>
        </form>
    );
}
