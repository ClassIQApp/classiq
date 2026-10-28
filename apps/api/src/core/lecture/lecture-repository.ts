import type { Lecture } from "./model.ts";

export interface CreateLectureInput {
    courseId: string;
    title: string;
    description: string;
}

export interface UpdateLectureInput {
    title?: string;
    description?: string;
    status?: Lecture["status"];
    statusMessage?: string;
}

export interface LectureRepository {
    listCourseLectures(courseId: string): Promise<Lecture[]>;

    getLecture(courseId: string, lectureId: string): Promise<Lecture | null>;

    createLecture(input: CreateLectureInput): Promise<Lecture>;

    updateLecture(courseId: string, lectureId: string, input: UpdateLectureInput): Promise<Lecture | null>;
}
