import type { LectureRepository } from "../lecture/lecture-repository.ts";
import { courses } from "./data.ts";

export class CourseFacade {
    private readonly lectureRepository: LectureRepository;

    constructor(lectureRepository: LectureRepository) {
        this.lectureRepository = lectureRepository;
    }

    async listCourses() {
        return Promise.all(
            courses.map(async (course) => ({
                ...course,
                lectures: await this.lectureRepository.listCourseLectures(course.id),
            })),
        );
    }
}
