import type { LlmCallOptions } from "../ai/model.ts";
import type { ContentIndexService } from "../content-index/content-index-service.ts";
import { StudyGuideError } from "./errors.ts";
import { studyGuideGenerationRequestSchema, type StudyGuide, type StudyGuideGenerationRequest, type StudyGuideSummary } from "./model.ts";
import type { StudyGuideGenerator } from "./study-guide-generator.ts";
import type { StudyGuideRepository } from "./study-guide-repository.ts";
import * as z from "zod/mini";

const idSchema = z.string().check(z.regex(/^[1-9]\d{0,9}$/));

export class StudyGuideService {
    private readonly repository: StudyGuideRepository;

    private readonly content: Pick<ContentIndexService, "listPassages">;

    private readonly generator: Pick<StudyGuideGenerator, "generate">;

    constructor(
        repository: StudyGuideRepository,
        content: Pick<ContentIndexService, "listPassages">,
        generator: Pick<StudyGuideGenerator, "generate">,
    ) {
        this.repository = repository;
        this.content = content;
        this.generator = generator;
    }

    /**
     * Generates and stores a study guide from one lecture's
     * indexed content, or from the entire course when
     * lectureId is omitted.
     */
    async generateStudyGuide(request: StudyGuideGenerationRequest, options: LlmCallOptions = {}): Promise<StudyGuideSummary> {
        const parsed = studyGuideGenerationRequestSchema.safeParse(request);

        if (!parsed.success) {
            throw new StudyGuideError("invalid_request");
        }

        const { courseId, lectureId, createdByUserId, language = "en" } = parsed.data;

        if (!(await this.repository.scopeExists(courseId, lectureId))) {
            throw new StudyGuideError("not_found");
        }

        const passages = await this.content.listPassages({
            courseId,

            ...(lectureId === undefined
                ? {}
                : {
                      lectureId,
                  }),
        });

        if (passages.length === 0) {
            throw new StudyGuideError("no_content");
        }

        const generated = await this.generator.generate(passages, options, language);

        const guide = await this.repository.createStudyGuide({
            courseId,

            ...(lectureId === undefined
                ? {}
                : {
                      lectureId,
                  }),

            ...(createdByUserId === undefined
                ? {}
                : {
                      createdByUserId,
                  }),

            ...generated,
        });

        return summarize(guide);
    }

    /**
     * Lists guides for the entire course, or only guides
     * generated for one lecture when lectureId is supplied.
     */
    async listStudyGuides(courseId: string, lectureId?: string): Promise<StudyGuideSummary[]> {
        parseIds(courseId, ...(lectureId === undefined ? [] : [lectureId]));

        return this.repository.listStudyGuides(courseId, lectureId);
    }

    /**
     * Retrieves one complete study guide with its source context.
     */
    async getStudyGuide(courseId: string, studyGuideId: string): Promise<StudyGuide> {
        parseIds(courseId, studyGuideId);

        const guide = await this.repository.getStudyGuide(courseId, studyGuideId);

        if (!guide) {
            throw new StudyGuideError("not_found");
        }

        return guide;
    }

    /**
     * Deletes one study guide belonging to the supplied course.
     */
    async deleteStudyGuide(courseId: string, studyGuideId: string): Promise<void> {
        parseIds(courseId, studyGuideId);

        const deleted = await this.repository.deleteStudyGuide(courseId, studyGuideId);

        if (!deleted) {
            throw new StudyGuideError("not_found");
        }
    }
}

function parseIds(...ids: string[]) {
    if (!ids.every((value) => idSchema.safeParse(value).success)) {
        throw new StudyGuideError("invalid_request");
    }
}

function summarize({ id, courseId, lectureId, title, sectionCount, createdAt }: StudyGuideSummary): StudyGuideSummary {
    return {
        id,
        courseId,

        ...(lectureId === undefined
            ? {}
            : {
                  lectureId,
              }),

        title,
        sectionCount,
        createdAt,
    };
}
