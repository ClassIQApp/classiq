import { LectureFacade } from "../../core/lecture/lecture-facade.ts";

const lectures = new LectureFacade();

export async function handler(event: { courseId: string }) {
    const courseLectures = await lectures.listCourseLectures(event.courseId);

    return {
        courseId: event.courseId,
        lectureCount: courseLectures.length,
    };
}
