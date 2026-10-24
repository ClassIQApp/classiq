import { CourseFacade } from "../../core/course/course-facade.ts";
import { LectureFacade } from "../../core/lecture/lecture-facade.ts";
import { Hono } from "hono";

const courses = new CourseFacade(new LectureFacade());
const routes = new Hono();

routes.get("/", async (c) => c.json({ items: await courses.listCourses() }));

export default routes;
