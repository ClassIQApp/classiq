import type { StudyGuide, StudyGuideDraft, StudyGuideSummary } from "./model.ts";

export interface StudyGuideRepository {
    scopeExists(courseId: string, lectureId?: string): Promise<boolean>;

    createStudyGuide(draft: StudyGuideDraft): Promise<StudyGuide>;

    listStudyGuides(courseId: string, lectureId?: string): Promise<StudyGuideSummary[]>;

    getStudyGuide(courseId: string, studyGuideId: string): Promise<StudyGuide | undefined>;

    deleteStudyGuide(courseId: string, studyGuideId: string): Promise<boolean>;
}
