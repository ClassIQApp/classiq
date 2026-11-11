import { createLlmService } from "./core/ai/create-llm-service.ts";
import { createAuth, type AuthenticatedUser, type AuthService } from "./core/auth/auth.ts";
import { readAuthConfig, type AuthConfig } from "./core/auth/config.ts";
import { requireSession } from "./core/auth/middleware.ts";
import { ContentIndexService } from "./core/content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "./core/content-index/postgres-content-index-repository.ts";
import { requireCourseRole } from "./core/course-access/middleware.ts";
import type { CourseRole } from "./core/course-access/model.ts";
import { PostgresCourseMembershipFacade } from "./core/course-access/postgres-course-membership-facade.ts";
import { CourseInvitationService } from "./core/course-invitation/course-invitation-service.ts";
import { PostgresCourseInvitationFacade } from "./core/course-invitation/postgres-course-invitation-facade.ts";
import { readCourseResourceFileConfig } from "./core/course-resource/file/config.ts";
import { lecturePipeline, lectureStages } from "./core/processing/lecture-pipeline.ts";
import { PostgresProcessingRepository } from "./core/processing/postgres-processing-repository.ts";
import { ProcessingService, type PipelineStarter } from "./core/processing/processing-service.ts";
import { resourcePipeline } from "./core/processing/resource-pipeline.ts";
import { sqsPipelineStarter } from "./core/processing/sqs-pipeline-starter.ts";
import { PostgresQuizRepository } from "./core/quiz/postgres-quiz-repository.ts";
import { QuizGenerator } from "./core/quiz/quiz-generator.ts";
import { QuizService } from "./core/quiz/quiz-service.ts";
import { PostgresStudyGuideRepository } from "./core/study-guide/postgres-study-guide-repository.ts";
import { StudyGuideGenerator } from "./core/study-guide/study-guide-generator.ts";
import { StudyGuideService } from "./core/study-guide/study-guide-service.ts";
import type { UploadAsset, UploadStorage } from "./core/uploads/model.ts";
import { PostgresUploadRepository } from "./core/uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "./core/uploads/s3-upload-storage.ts";
import authRoutes from "./routes/auth/index.ts";
import { createContentRoutes } from "./routes/content/index.ts";
import courseRoutes from "./routes/courses/index.ts";
import { createCourseInvitationRoutes, createInvitationRoutes } from "./routes/invitations/index.ts";
import { createLectureRoutes } from "./routes/lectures/index.ts";
import { createQuizRoutes } from "./routes/quizzes/index.ts";
import { createStudyGuideRoutes } from "./routes/study-guides/index.ts";
import { createUploadRoutes } from "./routes/uploads/index.ts";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
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
    pipelineStarter?: PipelineStarter;
}

function createUploadStorage(): UploadStorage {
    const config = readCourseResourceFileConfig(process.env);

    return new S3UploadStorage(
        config,
        new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            forcePathStyle: Boolean(config.endpoint),
            ...(config.endpoint
                ? {
                      credentials: {
                          accessKeyId: "classiq",
                          secretAccessKey: "classiq-local",
                      },
                  }
                : {}),
        }),
    );
}

export function createApp(getDb: () => Pool, options: AppOptions = {}): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    let auth: AuthService | undefined;
    let config: AuthConfig | undefined;
    let uploadStorage: UploadStorage | undefined;
    let contentIndexService: ContentIndexService | undefined;
    let processing: ProcessingService | undefined;
    let invitationService: CourseInvitationService | undefined;
    let quizService: QuizService | undefined;
    let studyGuideService: StudyGuideService | undefined;
    let llmService: ReturnType<typeof createLlmService> | undefined;

    const getConfig = () => (config ??= (options.getAuthConfig ?? readAuthConfig)());

    const getAuth = options.getAuth ?? (() => (auth ??= createAuth(getDb(), getConfig())));

    const getUploadStorage = options.getUploadStorage ?? (() => (uploadStorage ??= createUploadStorage()));

    const getInvitationService = () =>
        (invitationService ??= new CourseInvitationService(
            new PostgresCourseInvitationFacade(getDb()),
            new PostgresCourseMembershipFacade(getDb()),
        ));

    const getContentIndexService = () => (contentIndexService ??= new ContentIndexService(new PostgresContentIndexRepository(getDb())));

    const getLlmService = () => (llmService ??= createLlmService());

    const getQuizService = () =>
        (quizService ??= new QuizService(
            new PostgresQuizRepository(getDb()),
            getContentIndexService(),
            new QuizGenerator(getLlmService()),
        ));

    const getStudyGuideService = () =>
        (studyGuideService ??= new StudyGuideService(
            new PostgresStudyGuideRepository(getDb()),
            getContentIndexService(),
            new StudyGuideGenerator(getLlmService()),
        ));

    const processingRepository = () => new PostgresProcessingRepository(getDb());

    const getProcessing = () => {
        if (!processing) {
            const starter: PipelineStarter =
                options.pipelineStarter ??
                (async (request) => {
                    if (
                        process.env.NODE_ENV === "production" ||
                        process.env.SQS_ENDPOINT !== "http://localhost:9324" ||
                        process.env.SQS_QUEUE_URL !== "http://localhost:9324/000000000000/classiq-local" ||
                        !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "").hostname)
                    ) {
                        throw new Error("No processing starter configured.");
                    }

                    const client = new SQSClient({
                        region: "us-east-1",
                        endpoint: process.env.SQS_ENDPOINT,
                        credentials: {
                            accessKeyId: "classiq",
                            secretAccessKey: "classiq-local",
                        },
                    });

                    try {
                        await sqsPipelineStarter(client, process.env.SQS_QUEUE_URL, {
                            lecture: lecturePipeline,
                            resource: resourcePipeline,
                        })(request);
                    } finally {
                        client.destroy();
                    }
                });

            processing = new ProcessingService(processingRepository(), starter);
        }

        return processing;
    };

    function startResource(asset: UploadAsset) {
        return getProcessing().start(
            {
                kind: "resource",
                courseId: asset.courseId,
                resourceId: asset.resourceId!,
            },
            ["extraction"],
            resourcePipeline.timeoutSeconds,
        );
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
            startResource,
            startRecording: (asset) =>
                getProcessing().start(
                    {
                        kind: "lecture",
                        courseId: asset.courseId,
                        lectureId: asset.lectureId!,
                    },
                    lectureStages,
                    lecturePipeline.timeoutSeconds,
                ),
            resourceProcessing: (asset) =>
                processingRepository().stages({
                    kind: "resource",
                    courseId: asset.courseId,
                    resourceId: asset.resourceId!,
                }),
        }),
    );

    app.route(
        "/courses",
        createContentRoutes<AppEnv>({
            requireCourseRole,
            getService: getContentIndexService,
        }),
    );

    app.route(
        "/courses",
        createLectureRoutes<AppEnv>({
            getDb,
            getProcessing,
            getLlmService,
            requireCourseRole,
        }),
    );

    app.route(
        "/courses",
        createQuizRoutes<AppEnv>({
            requireCourseRole,
            getUserId: (c) => c.get("user").id,
            getService: getQuizService,
        }),
    );

    app.route(
        "/courses",
        createStudyGuideRoutes<AppEnv>({
            requireCourseRole,
            getUserId: (c) => c.get("user").id,
            getService: getStudyGuideService,
        }),
    );

    app.route(
        "/courses/:courseId/invitations",
        createCourseInvitationRoutes<AppEnv>({
            requireCourseRole,
            getInvitationService,
        }),
    );

    app.route(
        "/invitations",
        createInvitationRoutes<AppEnv>({
            requireSession,
            getInvitationService,
        }),
    );

    app.get("/", (c) =>
        c.json({
            message: "hello from node",
        }),
    );

    return app;
}
