import type { LlmCallOptions } from "../ai/model.ts";
import type { ContentIndexService } from "../content-index/content-index-service.ts";
import { QaError } from "./errors.ts";
import { questionRequestSchema, type CourseAnswer, type QuestionRequest } from "./model.ts";
import { NO_EVIDENCE_ANSWER, type QuestionAnswerer } from "./question-answerer.ts";
import { toSearchQuery } from "./search-query.ts";

const RETRIEVED_PASSAGES = 8;

export class QuestionService {
    private readonly content: Pick<ContentIndexService, "search">;
    private readonly answerer: Pick<QuestionAnswerer, "answer">;

    constructor(content: Pick<ContentIndexService, "search">, answerer: Pick<QuestionAnswerer, "answer">) {
        this.content = content;
        this.answerer = answerer;
    }

    /** Answers a question from the course's indexed lectures and resources, or from one lecture. */
    async ask(request: QuestionRequest, options: LlmCallOptions = {}): Promise<CourseAnswer> {
        const parsed = questionRequestSchema.safeParse(request);

        if (!parsed.success) {
            throw new QaError("invalid_request");
        }

        const { courseId, question, lectureId } = parsed.data;
        const text = toSearchQuery(question);
        const passages =
            text === undefined
                ? []
                : await this.content.search({
                      courseId,
                      text,
                      limit: RETRIEVED_PASSAGES,
                      ...(lectureId === undefined ? {} : { lectureId }),
                  });

        if (passages.length === 0) {
            return { answerable: false, answer: NO_EVIDENCE_ANSWER, sources: [] };
        }

        return this.answerer.answer(question, passages, options);
    }
}
