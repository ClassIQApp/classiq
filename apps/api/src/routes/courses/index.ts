import type { AppEnv } from "../../app.ts";
import { CourseFacade } from "../../core/course/course-facade.ts";
import type { CreateLectureInput, UpdateLectureInput } from "../../core/lecture/lecture-repository.ts";
import type { LectureApiError, ListCourseLecturesResponse } from "../../core/lecture/model.ts";
import { PostgresLectureRepository } from "../../core/lecture/postgres-lecture-repository.ts";
import { Hono } from "hono";

const routes = new Hono<AppEnv>();

/* Get all courses */
routes.get("/", async (c) => {
    const database = c.get("getDb")();
    const lectures = new PostgresLectureRepository(database);
    const courses = new CourseFacade(lectures);

    return c.json({
        items: await courses.listCourses(),
    });
});

/* Get all lectures for one course */
routes.get("/:courseId/lectures", async (c) => {
    const courseId = c.req.param("courseId");

    const database = c.get("getDb")();
    const lectures = new PostgresLectureRepository(database);

    const response: ListCourseLecturesResponse = {
        items: await lectures.listCourseLectures(courseId),
    };

    return c.json(response);
});

/* Create a new lecture */
routes.post("/:courseId/lectures", async (c) => {
    const courseId = c.req.param("courseId");
    const body = await c.req.json<{
        title?: string;
        description?: string;
    }>();

    if (!body.title || !body.description) {
        const error: LectureApiError = {
            code: "INVALID_LECTURE",
            message: "Title and description are required.",
        };

        return c.json(error, 400);
    }

    const input: CreateLectureInput = {
        courseId,
        title: body.title,
        description: body.description,
    };

    const database = c.get("getDb")();
    const lectures = new PostgresLectureRepository(database);

    const lecture = await lectures.createLecture(input);

    return c.json(lecture, 201);
});

/* Update an existing lecture */
routes.patch("/:courseId/lectures/:lectureId", async (c) => {
    const lectureId = c.req.param("lectureId");

    const body = await c.req.json<UpdateLectureInput>();

    const database = c.get("getDb")();
    const lectures = new PostgresLectureRepository(database);

    const lecture = await lectures.updateLecture(lectureId, body);

    if (!lecture) {
        const error: LectureApiError = {
            code: "LECTURE_NOT_FOUND",
            message: "Lecture was not found.",
        };

        return c.json(error, 404);
    }

    return c.json(lecture);
});

export default routes;
