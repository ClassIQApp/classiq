export type StudyGuideErrorCode = "invalid_request" | "not_found" | "no_content" | "generation_failed";

const messages: Record<StudyGuideErrorCode, string> = {
    invalid_request: "The study guide request is invalid.",
    not_found: "The course, lecture, or study guide was not found.",
    no_content: "There is no indexed lecture or course content to build a study guide from yet.",
    generation_failed: "A usable study guide could not be generated from this content.",
};

export class StudyGuideError extends Error {
    readonly code: StudyGuideErrorCode;

    constructor(code: StudyGuideErrorCode) {
        super(messages[code]);
        this.name = "StudyGuideError";
        this.code = code;
    }
}
