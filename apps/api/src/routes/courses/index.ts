import type { AppEnv } from "../../app.ts";
import { requireCourseRole } from "../../core/course-access/middleware.ts";
import { CourseService } from "../../core/course/course-service.ts";
import { CourseError, type CourseErrorCode } from "../../core/course/errors.ts";
import type { CourseMetadataUpdate, CourseRegistration, MemberCourse } from "../../core/course/model.ts";
import { PostgresCourseFacade } from "../../core/course/postgres-course-facade.ts";
import type { CreateLectureInput, UpdateLectureInput } from "../../core/lecture/lecture-repository.ts";
import type { Lecture, LectureApiError, ListCourseLecturesResponse } from "../../core/lecture/model.ts";
import { PostgresLectureRepository } from "../../core/lecture/postgres-lecture-repository.ts";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const responseByCourseErrorCode: Record<CourseErrorCode, { status: ContentfulStatusCode; code: string }> = {
    invalid_reference: { status: 404, code: "COURSE_NOT_FOUND" },
    invalid_course: { status: 400, code: "INVALID_COURSE" },
    not_found: { status: 404, code: "COURSE_NOT_FOUND" },
    conflict: { status: 409, code: "COURSE_CONFLICT" },
    provider_error: { status: 503, code: "COURSE_UNAVAILABLE" },
};

function courseResponse(course: MemberCourse, lectures: Lecture[]) {
    return {
        id: course.id,
        code: course.code ?? "",
        name: course.name,
        description: course.description ?? "",
        role: course.role,
        lectures,
    };
}

const routes = new Hono<AppEnv>();

routes.onError((error, c) => {
    if (error instanceof CourseError) {
        const response = responseByCourseErrorCode[error.code];

        return c.json({ code: response.code, message: error.message }, response.status);
    }

    if (error instanceof SyntaxError) {
        return c.json({ code: "INVALID_REQUEST", message: "The request body must be valid JSON." }, 400);
    }

    console.error(error);

    return c.json({ code: "INTERNAL_ERROR", message: "The request could not be completed." }, 500);
});

/* Get the current account's courses */
routes.get("/", async (c) => {
    const database = c.get("getDb")();

    const courseRepository = new PostgresCourseFacade(database);
    const courseService = new CourseService(courseRepository);
    const lectures = new PostgresLectureRepository(database);

    const courses = await courseService.listMemberCourses(c.var.user.id);

    return c.json({
        items: await Promise.all(courses.map(async (course) => courseResponse(course, await lectures.listCourseLectures(course.id)))),
    });
});

/* Create a course taught by the current account */
routes.post("/", async (c) => {
    const body = await c.req.json<CourseRegistration>();

    const database = c.get("getDb")();
    const courseRepository = new PostgresCourseFacade(database);
    const courseService = new CourseService(courseRepository);

    const course = await courseService.registerCourse(body, c.var.user.id);

    return c.json(courseResponse(course, []), 201);
});

/* Get one course */
routes.get("/:courseId", requireCourseRole("member"), async (c) => {
    const courseId = c.req.param("courseId");

    const database = c.get("getDb")();
    const courseRepository = new PostgresCourseFacade(database);
    const courseService = new CourseService(courseRepository);
    const lectures = new PostgresLectureRepository(database);

    const course = await courseService.fetchCourse(courseId);

    return c.json(courseResponse({ ...course, role: c.var.courseRole }, await lectures.listCourseLectures(courseId)));
});

/* Update course settings */
routes.patch("/:courseId", requireCourseRole("teacher"), async (c) => {
    const courseId = c.req.param("courseId");
    const body = await c.req.json<CourseMetadataUpdate>();

    const database = c.get("getDb")();
    const courseRepository = new PostgresCourseFacade(database);
    const courseService = new CourseService(courseRepository);
    const lectures = new PostgresLectureRepository(database);

    const course = await courseService.updateCourseMetadata(courseId, body);

    return c.json(courseResponse({ ...course, role: c.var.courseRole }, await lectures.listCourseLectures(courseId)));
});

/* Get all lectures for one course */
routes.get("/:courseId/lectures", requireCourseRole("member"), async (c) => {
    const courseId = c.req.param("courseId");

    const database = c.get("getDb")();
    const lectures = new PostgresLectureRepository(database);

    const response: ListCourseLecturesResponse = {
        items: await lectures.listCourseLectures(courseId),
    };

    return c.json(response);
});

/* Create a new lecture */
routes.post("/:courseId/lectures", requireCourseRole("teacher"), async (c) => {
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
routes.patch("/:courseId/lectures/:lectureId", requireCourseRole("teacher"), async (c) => {
    const courseId = c.req.param("courseId");
    const lectureId = c.req.param("lectureId");

    const body = await c.req.json<UpdateLectureInput>();

    const database = c.get("getDb")();
    const lectures = new PostgresLectureRepository(database);

    const lecture = await lectures.updateLecture(courseId, lectureId, body);

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
