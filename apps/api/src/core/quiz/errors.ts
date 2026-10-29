export type QuizErrorCode = "invalid_request" | "invalid_attempt" | "not_found" | "no_content" | "generation_failed";

const messages: Record<QuizErrorCode, string> = {
    invalid_request: "The quiz request is invalid.",
    invalid_attempt: "The quiz answers are invalid.",
    not_found: "The course, lecture, quiz, or attempt was not found.",
    no_content: "There is no indexed lecture or course content to build a quiz from yet.",
    generation_failed: "A usable quiz could not be generated from this content.",
};

export class QuizError extends Error {
    readonly code: QuizErrorCode;

    constructor(code: QuizErrorCode) {
        super(messages[code]);
        this.name = "QuizError";
        this.code = code;
    }
}
