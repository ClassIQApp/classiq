import { createApp } from "../app.ts";
import { LlmError } from "../core/ai/errors.ts";
import type { IndexedPassage } from "../core/content-index/model.ts";
import { StudyGuideError } from "../core/study-guide/errors.ts";
import type { StudyGuide, StudyGuideDraft } from "../core/study-guide/model.ts";
import type { StudyGuideRepository } from "../core/study-guide/study-guide-repository.ts";
import { StudyGuideService } from "../core/study-guide/study-guide-service.ts";
import { createStudyGuideRoutes } from "../routes/study-guides/index.ts";
import { Hono, type MiddlewareHandler } from "hono";
import { describe, expect, it, vi } from "vitest";

const studyGuide: StudyGuide = {
    id: "10",
    courseId: "1",
    lectureId: "2",
    title: "Enzymes Study Guide",
    overview: "This guide reviews enzymes and inhibitors.",
    overviewSources: [
        {
            kind: "transcript",
            lectureId: "2",
            title: "Enzymes",
            startSeconds: 0,
            endSeconds: 10,
        },
    ],
    sectionCount: 1,
    createdAt: "2026-11-07T00:00:00.000Z",
    sections: [
        {
            id: "100",
            position: 0,
            heading: "Enzyme Function",
            content: "Enzymes lower activation energy.",
            keyPoints: ["Enzymes help reactions happen more easily."],
            sources: [
                {
                    kind: "transcript",
                    lectureId: "2",
                    title: "Enzymes",
                    startSeconds: 0,
                    endSeconds: 10,
                },
            ],
        },
    ],
};

const passage: IndexedPassage = {
    id: "1",
    kind: "transcript",
    courseId: "1",
    lectureId: "2",
    title: "Enzymes",
    content: "Enzymes lower activation energy.",
    startSeconds: 0,
    endSeconds: 10,
};

const requireTestRole =
    (role: "member" | "teacher"): MiddlewareHandler =>
    async (c, next) => {
        const granted = c.req.header("test-role");

        if (!granted) {
            return c.json(
                {
                    code: "UNAUTHENTICATED",
                    message: "Sign in",
                },
                401,
            );
        }

        if (granted !== "teacher" && !(role === "member" && granted === "member")) {
            return c.json(
                {
                    code: "FORBIDDEN",
                    message: "Insufficient role",
                },
                403,
            );
        }

        await next();
    };

function fixture(
    generate = vi.fn(async () => ({
        title: studyGuide.title,
        overview: studyGuide.overview,
        overviewSources: studyGuide.overviewSources,
        model: "gpt-test",
        sections: studyGuide.sections.map(({ heading, content, keyPoints, sources }) => ({
            heading,
            content,
            keyPoints,
            sources,
        })),
    })),
) {
    const repository = {
        scopeExists: vi.fn(async () => true),

        createStudyGuide: vi.fn(async (draft: StudyGuideDraft) => ({
            id: "10",
            courseId: draft.courseId,
            ...(draft.lectureId === undefined ? {} : { lectureId: draft.lectureId }),
            title: draft.title,
            overview: draft.overview,
            overviewSources: draft.overviewSources,
            sectionCount: draft.sections.length,
            createdAt: "2026-11-07T00:00:00.000Z",
            sections: draft.sections.map((section, position) => ({
                ...section,
                id: String(100 + position),
                position,
            })),
        })),

        listStudyGuides: vi.fn(async () => [
            {
                id: studyGuide.id,
                courseId: studyGuide.courseId,
                lectureId: studyGuide.lectureId,
                title: studyGuide.title,
                sectionCount: studyGuide.sectionCount,
                createdAt: studyGuide.createdAt,
            },
        ]),

        getStudyGuide: vi.fn(async (courseId: string, studyGuideId: string) =>
            courseId === "1" && studyGuideId === "10" ? studyGuide : undefined,
        ),
    } satisfies StudyGuideRepository;

    const service = new StudyGuideService(
        repository,
        {
            listPassages: vi.fn(async () => [passage]),
        },
        {
            generate,
        },
    );

    const app = new Hono().route(
        "/courses",
        createStudyGuideRoutes({
            getService: () => service,
            requireCourseRole: requireTestRole,
            getUserId: (c) => c.req.header("test-user") ?? "9",
        }),
    );

    function request(method: string, path: string, body?: unknown, role = "member") {
        return app.request(`/courses/${path}`, {
            method,
            headers: {
                "content-type": "application/json",
                "test-role": role,
                "test-user": "9",
            },
            ...(body === undefined
                ? {}
                : {
                      body: typeof body === "string" ? body : JSON.stringify(body),
                  }),
        });
    }

    return {
        repository,
        generate,
        request,
    };
}

describe("study guide router", () => {
    it("mounts study guide endpoints behind sessions without building the service for anonymous requests", async () => {
        const app = createApp(
            () => {
                throw new Error("Database must not be accessed");
            },
            {
                getAuth: () => ({
                    handler: async () => new Response(),
                    api: {
                        getSession: async () => null,
                    },
                }),
            },
        );

        const generateResponse = await app.request("/courses/1/study-guides", {
            method: "POST",
        });

        const getResponse = await app.request("/courses/1/study-guides/10");

        expect(generateResponse.status).toBe(401);
        expect(getResponse.status).toBe(401);
    });

    it("requires injected authorization and user lookup at construction", () => {
        const service = new StudyGuideService(
            fixture().repository,
            {
                listPassages: vi.fn(),
            },
            {
                generate: vi.fn(),
            },
        );

        expect(() =>
            createStudyGuideRoutes({
                getService: () => service,
                requireCourseRole: undefined!,
                getUserId: () => "1",
            }),
        ).toThrow("authorization");

        expect(() =>
            createStudyGuideRoutes({
                getService: () => service,
                requireCourseRole: requireTestRole,
                getUserId: undefined!,
            }),
        ).toThrow("authorization");
    });

    it("lets teachers generate study guides but not members", async () => {
        const { request, generate, repository } = fixture();

        const memberResponse = await request("POST", "1/study-guides", {
            lectureId: "2",
        });

        const teacherResponse = await request(
            "POST",
            "1/study-guides",
            {
                lectureId: "2",
            },
            "teacher",
        );

        expect(memberResponse.status).toBe(403);
        expect(teacherResponse.status).toBe(201);

        expect(await teacherResponse.json()).toMatchObject({
            id: "10",
            courseId: "1",
            lectureId: "2",
            title: "Enzymes Study Guide",
            sectionCount: 1,
        });

        expect(generate).toHaveBeenCalledTimes(1);

        expect(generate.mock.calls[0]).toEqual([
            expect.any(Array),
            expect.objectContaining({
                signal: expect.any(AbortSignal),
            }),
        ]);

        expect(repository.createStudyGuide).toHaveBeenCalledWith(
            expect.objectContaining({
                courseId: "1",
                lectureId: "2",
                createdByUserId: "9",
            }),
        );
    });

    it("generates a course-wide study guide when lectureId is omitted", async () => {
        const { request, repository } = fixture();

        const response = await request("POST", "1/study-guides", {}, "teacher");

        expect(response.status).toBe(201);

        expect(repository.createStudyGuide).toHaveBeenCalledWith(
            expect.objectContaining({
                courseId: "1",
            }),
        );

        const draft = repository.createStudyGuide.mock.calls[0]![0];

        expect(draft).not.toHaveProperty("lectureId");
    });

    it.each([
        ["", 401],
        ["unrelated", 403],
    ])("denies role %j on every study guide endpoint", async (role, status) => {
        const { request, repository } = fixture();

        const responses = await Promise.all([
            request("GET", "1/study-guides", undefined, role),
            request("GET", "1/study-guides/10", undefined, role),
            request("POST", "1/study-guides", {}, role),
        ]);

        expect(responses.map((response) => response.status)).toEqual([status, status, status]);

        expect(repository.getStudyGuide).not.toHaveBeenCalled();
    });

    it("lets course members list study guides", async () => {
        const { request, repository } = fixture();

        const response = await request("GET", "1/study-guides");

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");

        expect(await response.json()).toEqual({
            items: [
                {
                    id: "10",
                    courseId: "1",
                    lectureId: "2",
                    title: "Enzymes Study Guide",
                    sectionCount: 1,
                    createdAt: "2026-11-07T00:00:00.000Z",
                },
            ],
        });

        expect(repository.listStudyGuides).toHaveBeenCalledWith("1", undefined);
    });

    it("filters study guides by lecture", async () => {
        const { request, repository } = fixture();

        const response = await request("GET", "1/study-guides?lectureId=2");

        expect(response.status).toBe(200);

        expect(repository.listStudyGuides).toHaveBeenCalledWith("1", "2");
    });

    it("returns one complete study guide with its source context", async () => {
        const { request } = fixture();

        const response = await request("GET", "1/study-guides/10");

        expect(response.status).toBe(200);

        const body = await response.json();

        expect(body).toMatchObject({
            id: "10",
            title: "Enzymes Study Guide",
            overview: "This guide reviews enzymes and inhibitors.",
            sections: [
                {
                    heading: "Enzyme Function",
                    keyPoints: ["Enzymes help reactions happen more easily."],
                },
            ],
        });

        expect(body.overviewSources).toEqual([
            {
                kind: "transcript",
                lectureId: "2",
                title: "Enzymes",
                startSeconds: 0,
                endSeconds: 10,
            },
        ]);

        expect(body.sections[0].sources).toEqual([
            {
                kind: "transcript",
                lectureId: "2",
                title: "Enzymes",
                startSeconds: 0,
                endSeconds: 10,
            },
        ]);
    });

    it.each([
        ["POST", "1/study-guides", "{not json", "teacher", 400, "INVALID_STUDY_GUIDE_REQUEST"],
        ["POST", "1/study-guides", "null", "teacher", 400, "INVALID_STUDY_GUIDE_REQUEST"],
        [
            "POST",
            "1/study-guides",
            {
                lectureId: "2",
                extra: true,
            },
            "teacher",
            400,
            "INVALID_STUDY_GUIDE_REQUEST",
        ],
        [
            "POST",
            "1/study-guides",
            {
                lectureId: "0",
            },
            "teacher",
            400,
            "INVALID_STUDY_GUIDE_REQUEST",
        ],
        ["GET", "1/study-guides?lectureId=abc", undefined, "member", 400, "INVALID_STUDY_GUIDE_REQUEST"],
        ["GET", "1/study-guides/abc", undefined, "member", 400, "INVALID_STUDY_GUIDE_REQUEST"],
        ["GET", "2/study-guides/10", undefined, "member", 404, "NOT_FOUND"],
    ])("maps %s %s with %j to %i", async (method, path, body, role, status, code) => {
        const { request } = fixture();

        const response = await request(method, path, body, role);

        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({
            code,
        });
    });

    it.each([
        [new StudyGuideError("no_content"), 409, "NO_CONTENT"],
        [new StudyGuideError("generation_failed"), 502, "GENERATION_FAILED"],
        [new LlmError("provider_error"), 502, "GENERATION_FAILED"],
        [new LlmError("timeout"), 504, "GENERATION_TIMEOUT"],
        [new Error("connect ECONNREFUSED 10.0.0.1"), 503, "STUDY_GUIDE_UNAVAILABLE"],
    ])("maps generation failure %o", async (error, status, code) => {
        const { request } = fixture(
            vi.fn(async () => {
                throw error;
            }),
        );

        const response = await request("POST", "1/study-guides", {}, "teacher");

        const text = await response.text();

        expect(response.status).toBe(status);
        expect(JSON.parse(text)).toMatchObject({
            code,
        });

        expect(text).not.toContain("10.0.0.1");
    });
});
