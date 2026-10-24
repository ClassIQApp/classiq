import { CourseFacade } from "../../core/course/course-facade.ts";
import { LectureFacade } from "../../core/lecture/lecture-facade.ts";
import type { ListCourseLecturesResponse } from "../../core/lecture/model.ts";
import { Hono } from "hono";

const courses = new CourseFacade();
const lectures = new LectureFacade();

const routes = new Hono();

/* Get all courses */
routes.get("/", async (c) => {
    return c.json({
        items: await courses.listCourses(),
    });
});

/* Get all lectures for one course */
routes.get("/:courseId/lectures", async (c) => {
    const courseId = c.req.param("courseId");

    const response: ListCourseLecturesResponse = {
        items: await lectures.listCourseLectures(courseId),
    };

    return c.json(response);
});

export default routes;
