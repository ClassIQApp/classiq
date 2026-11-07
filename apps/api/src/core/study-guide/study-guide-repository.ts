import type { StudyGuide, StudyGuideDraft, StudyGuideSummary } from "./model.ts";

/**
 * All study-guide operations are scoped to a course.
 * A guide may optionally belong to one lecture.
 */
export interface StudyGuideRepository {
    /**
     * Checks that the requested course exists, or that the lecture
     * belongs to the requested course.
     */
    scopeExists(courseId: string, lectureId?: string): Promise<boolean>;

    /** Stores a newly generated study guide. */
    createStudyGuide(draft: StudyGuideDraft): Promise<StudyGuide>;

    /**
     * Lists study guides for a course.
     * If lectureId is provided, only guides for that lecture are returned.
     */
    listStudyGuides(courseId: string, lectureId?: string): Promise<StudyGuideSummary[]>;

    /** Gets one study guide while keeping it scoped to its course. */
    getStudyGuide(courseId: string, studyGuideId: string): Promise<StudyGuide | undefined>;
}
