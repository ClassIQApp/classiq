import { lecturesByCourseId } from "./data.ts";
import type { LectureRepository } from "./lecture-repository.ts";

export class LectureFacade implements LectureRepository {
    async listCourseLectures(courseId: string) {
        return lecturesByCourseId[courseId] ?? [];
    }
}
