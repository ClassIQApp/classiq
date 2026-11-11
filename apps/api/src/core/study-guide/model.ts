import type { ContentLocation, ContentSourceKind } from "../content-index/model.ts";
import * as z from "zod/mini";

const id = z.string().check(z.regex(/^[1-9]\d{0,9}$/));

export const studyGuideLanguageSchema = z.enum(["en", "es", "ar", "de", "fr"]);

export type StudyGuideLanguage = z.infer<typeof studyGuideLanguageSchema>;

/**
 * Request used to generate a study guide.
 * If lectureId is omitted, the guide covers the whole course.
 *
 * Language controls the language used for the generated
 * title, overview, section headings, section content,
 * and key points.
 */
export const studyGuideGenerationRequestSchema = z.strictObject({
    courseId: id,
    lectureId: z.optional(id),
    createdByUserId: z.optional(id),

    language: z.optional(studyGuideLanguageSchema),
});

export type StudyGuideGenerationRequest = z.infer<typeof studyGuideGenerationRequestSchema>;

/**
 * Structure the LLM must return.
 *
 * Validation of things such as empty sections,
 * unknown source IDs, duplicate sections,
 * and length limits is handled by the generator.
 */
export const generatedStudyGuideSchema = z.strictObject({
    title: z.string(),
    overview: z.string(),
    overviewSourceIds: z.array(z.string()),

    sections: z.array(
        z.strictObject({
            heading: z.string(),
            content: z.string(),
            keyPoints: z.array(z.string()),
            sourceIds: z.array(z.string()),
        }),
    ),
});

export type GeneratedStudyGuide = z.infer<typeof generatedStudyGuideSchema>;

/**
 * Snapshot of where generated study-guide content came from.
 * Sources are copied when the guide is generated so they survive
 * later content re-indexing.
 */
export interface StudyGuideSource extends ContentLocation {
    readonly kind: ContentSourceKind;
    readonly lectureId?: string;
    readonly resourceId?: string;
    readonly title: string;
}

export interface StudyGuideSectionDraft {
    readonly heading: string;
    readonly content: string;
    readonly keyPoints: readonly string[];
    readonly sources: readonly StudyGuideSource[];
}

export interface StudyGuideDraft {
    readonly courseId: string;
    readonly lectureId?: string;
    readonly title: string;
    readonly overview: string;
    readonly overviewSources: readonly StudyGuideSource[];
    readonly model: string;
    readonly createdByUserId?: string;
    readonly sections: readonly StudyGuideSectionDraft[];
}

export interface StudyGuideSummary {
    readonly id: string;
    readonly courseId: string;
    readonly lectureId?: string;
    readonly title: string;
    readonly sectionCount: number;
    readonly createdAt: string;
}

export interface StudyGuideSection {
    readonly id: string;
    readonly position: number;
    readonly heading: string;
    readonly content: string;
    readonly keyPoints: readonly string[];
    readonly sources: readonly StudyGuideSource[];
}

export interface StudyGuide extends StudyGuideSummary {
    readonly overview: string;
    readonly overviewSources: readonly StudyGuideSource[];
    readonly sections: readonly StudyGuideSection[];
}
