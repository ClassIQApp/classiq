import { lecturesByCourseId } from "./data.ts";
import type { LectureRepository } from "./lecture-repository.ts";
import type { Lecture } from "./model.ts";

export class LectureFacade implements Pick<LectureRepository, "listCourseLectures"> {
    async listCourseLectures(courseId: string): Promise<Lecture[]> {
        return lecturesByCourseId[courseId] ?? [];
    }
}
