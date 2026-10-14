import { LectureFacade } from "../lecture/lecture-facade.ts";
import type { LectureRepository } from "../lecture/lecture-repository.ts";
import type { CourseRepository } from "./course-repository.ts";
import { courses } from "./data.ts";

export class CourseFacade implements CourseRepository {
    private readonly lectureRepository: LectureRepository;

    constructor() {
        this.lectureRepository = new LectureFacade();
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
