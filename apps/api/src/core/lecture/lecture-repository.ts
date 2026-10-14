import type { Lecture } from "./model.ts";

export interface LectureRepository {
    listCourseLectures(courseId: string): Promise<Lecture[]>;
}
