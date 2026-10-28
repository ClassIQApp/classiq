import { createAuth, type AuthenticatedUser, type AuthService } from "./core/auth/auth.ts";
import { readAuthConfig, type AuthConfig } from "./core/auth/config.ts";
import { requireSession } from "./core/auth/middleware.ts";
import { ContentIndexService } from "./core/content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "./core/content-index/postgres-content-index-repository.ts";
import { ResourceContentIndexer } from "./core/content-index/resource-content-indexer.ts";
import { requireCourseRole } from "./core/course-access/middleware.ts";
import type { CourseRole } from "./core/course-access/model.ts";
import { PostgresCourseMembershipFacade } from "./core/course-access/postgres-course-membership-facade.ts";
import { CourseInvitationService } from "./core/course-invitation/course-invitation-service.ts";
import { PostgresCourseInvitationFacade } from "./core/course-invitation/postgres-course-invitation-facade.ts";
import { readCourseResourceFileConfig } from "./core/course-resource/file/config.ts";
import type { UploadAsset, UploadStorage } from "./core/uploads/model.ts";
import { PostgresUploadRepository } from "./core/uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "./core/uploads/s3-upload-storage.ts";
import authRoutes from "./routes/auth/index.ts";
import courseRoutes from "./routes/courses/index.ts";
import { createCourseInvitationRoutes, createInvitationRoutes } from "./routes/invitations/index.ts";
import { createUploadRoutes } from "./routes/uploads/index.ts";
import { S3Client } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";

export interface AppEnv {
    Variables: {
        getDb: () => Pool;
        getAuth: () => AuthService;
        getAuthConfig: () => AuthConfig;
        user: AuthenticatedUser;
        courseRole: CourseRole;
    };
}

export interface AppOptions {
    getAuth?: () => AuthService;
    getAuthConfig?: () => AuthConfig;
    getUploadStorage?: () => UploadStorage;
}

function createUploadStorage(): UploadStorage {
    const config = readCourseResourceFileConfig(process.env);

    return new S3UploadStorage(config, new S3Client({ region: config.region }));
}

export function createApp(getDb: () => Pool, options: AppOptions = {}): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    let auth: AuthService | undefined;
    let config: AuthConfig | undefined;
    let uploadStorage: UploadStorage | undefined;
    let resourceIndexer: ResourceContentIndexer | undefined;
    let invitationService: CourseInvitationService | undefined;
    const getConfig = () => (config ??= (options.getAuthConfig ?? readAuthConfig)());
    const getAuth = options.getAuth ?? (() => (auth ??= createAuth(getDb(), getConfig())));
    const getUploadStorage = options.getUploadStorage ?? (() => (uploadStorage ??= createUploadStorage()));
    const getInvitationService = () =>
        (invitationService ??= new CourseInvitationService(
            new PostgresCourseInvitationFacade(getDb()),
            new PostgresCourseMembershipFacade(getDb()),
        ));
    const getResourceIndexer = () =>
        (resourceIndexer ??= new ResourceContentIndexer(new ContentIndexService(new PostgresContentIndexRepository(getDb()))));

    function indexResource(asset: UploadAsset) {
        const resource = { courseId: asset.courseId, resourceId: asset.resourceId! };

        return getResourceIndexer().index(resource, () => getUploadStorage().read(asset));
    }

    app.use(async (c, next) => {
        c.set("getDb", getDb);
        c.set("getAuth", getAuth);
        c.set("getAuthConfig", getConfig);

        await next();
    });

    app.use("*", async (c, next) => {
        if (!c.req.header("Origin") && c.req.method !== "OPTIONS") {
            return next();
        }

        return cors({
            origin: (origin) => (getConfig().trustedOrigins.includes(origin) ? origin : undefined),
            credentials: true,
            allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
        })(c, next);
    });

    app.use("/courses/*", requireSession);

    app.route("/api/auth", authRoutes);
    app.route("/courses", courseRoutes);
    app.route(
        "/courses",
        createUploadRoutes<AppEnv>({
            requireCourseRole,
            getRepository: () => new PostgresUploadRepository(getDb()),
            getStorage: getUploadStorage,
            indexResource,
        }),
    );
    app.route("/courses/:courseId/invitations", createCourseInvitationRoutes<AppEnv>({ requireCourseRole, getInvitationService }));
    app.route("/invitations", createInvitationRoutes<AppEnv>({ requireSession, getInvitationService }));
    app.get("/", (c) => c.json({ message: "hello from node" }));

    return app;
}
