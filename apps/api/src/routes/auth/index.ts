import type { AppEnv } from "../../app.ts";
import { Hono } from "hono";

const authRoutes = new Hono<AppEnv>();

authRoutes.on(["GET", "POST"], "/*", (c) => c.var.getAuth().handler(c.req.raw));

export default authRoutes;
