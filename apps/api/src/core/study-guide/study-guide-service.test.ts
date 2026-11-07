import type { IndexedPassage } from "../content-index/model.ts";
import { StudyGuideError } from "./errors.ts";
import type { StudyGuide, StudyGuideDraft } from "./model.ts";
import type { StudyGuideRepository } from "./study-guide-repository.ts";
import { StudyGuideService } from "./study-guide-service.ts";
import { describe, expect, it, vi } from "vitest";

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

const generated = {
    title: "Enzymes Study Guide",
    overview: "This guide reviews the main ideas about enzymes.",
    overviewSources: [
        {
            kind: "transcript" as const,
            lectureId: "2",
            title: "Enzymes",
            startSeconds: 0,
            endSeconds: 10,
        },
    ],
    model: "gpt-test",
    sections: [
        {
            heading: "Enzyme Function",
            content: "Enzymes lower activation energy.",
            keyPoints: ["Enzymes help reactions happen more easily."],
            sources: [
                {
                    kind: "transcript" as const,
                    lectureId: "2",
                    title: "Enzymes",
                    startSeconds: 0,
                    endSeconds: 10,
                },
            ],
        },
    ],
};

function fixture({
    passages = [passage],
    scope = true,
}: {
    passages?: IndexedPassage[];
    scope?: boolean;
} = {}) {
    const guides = new Map<string, StudyGuide>();

    const repository = {
        scopeExists: vi.fn(async () => scope),

        createStudyGuide: vi.fn(async (draft: StudyGuideDraft) => {
            const guide: StudyGuide = {
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
            };

            guides.set(`${guide.courseId}/${guide.id}`, guide);

            return guide;
        }),

        listStudyGuides: vi.fn(async () => []),

        getStudyGuide: vi.fn(async (courseId: string, studyGuideId: string) => guides.get(`${courseId}/${studyGuideId}`)),
    } satisfies StudyGuideRepository;

    const content = {
        listPassages: vi.fn(async () => passages),
    };

    const generator = {
        generate: vi.fn(async () => generated),
    };

    return {
        repository,
        content,
        generator,
        service: new StudyGuideService(repository, content, generator),
    };
}

async function codeOf(promise: Promise<unknown>) {
    const error = await promise.then(
        () => undefined,
        (error: unknown) => error,
    );

    expect(error).toBeInstanceOf(StudyGuideError);

    return (error as StudyGuideError).code;
}

describe("StudyGuideService", () => {
    it("generates a lecture study guide from indexed passages and stores it", async () => {
        const { service, content, generator, repository } = fixture();

        const guide = await service.generateStudyGuide({
            courseId: "1",
            lectureId: "2",
            createdByUserId: "9",
        });

        expect(guide).toEqual({
            id: "10",
            courseId: "1",
            lectureId: "2",
            title: "Enzymes Study Guide",
            sectionCount: 1,
            createdAt: "2026-11-07T00:00:00.000Z",
        });

        expect(guide).not.toHaveProperty("sections");

        expect(content.listPassages).toHaveBeenCalledWith({
            courseId: "1",
            lectureId: "2",
        });

        expect(generator.generate).toHaveBeenCalledWith([passage], {});

        expect(repository.createStudyGuide).toHaveBeenCalledWith(
            expect.objectContaining({
                courseId: "1",
                lectureId: "2",
                createdByUserId: "9",
                model: "gpt-test",
                overview: "This guide reviews the main ideas about enzymes.",
            }),
        );
    });

    it("generates course-wide study guides", async () => {
        const { service, content } = fixture();

        await service.generateStudyGuide({
            courseId: "1",
        });

        expect(content.listPassages).toHaveBeenCalledWith({
            courseId: "1",
        });
    });

    it("reports a missing course or lecture before calling the generator", async () => {
        const { service, generator } = fixture({
            scope: false,
        });

        expect(
            await codeOf(
                service.generateStudyGuide({
                    courseId: "1",
                    lectureId: "99",
                }),
            ),
        ).toBe("not_found");

        expect(generator.generate).not.toHaveBeenCalled();
    });

    it("reports when there is no indexed content", async () => {
        const { service, generator } = fixture({
            passages: [],
        });

        expect(
            await codeOf(
                service.generateStudyGuide({
                    courseId: "1",
                }),
            ),
        ).toBe("no_content");

        expect(generator.generate).not.toHaveBeenCalled();
    });

    it.each([
        { courseId: "x" },
        { courseId: "0" },
        { courseId: "1", lectureId: "0" },
        { courseId: "1", lectureId: "abc" },
        { courseId: "1", createdByUserId: "bad" },
    ])("rejects invalid generation request %o", async (request) => {
        const { service } = fixture();

        expect(await codeOf(service.generateStudyGuide(request))).toBe("invalid_request");
    });

    it("retrieves a stored study guide with its sections and sources", async () => {
        const { service } = fixture();

        await service.generateStudyGuide({
            courseId: "1",
            lectureId: "2",
        });

        const guide = await service.getStudyGuide("1", "10");

        expect(guide.title).toBe("Enzymes Study Guide");

        expect(guide.overviewSources).toEqual([
            {
                kind: "transcript",
                lectureId: "2",
                title: "Enzymes",
                startSeconds: 0,
                endSeconds: 10,
            },
        ]);

        expect(guide.sections).toEqual([
            expect.objectContaining({
                id: "100",
                position: 0,
                heading: "Enzyme Function",
                keyPoints: ["Enzymes help reactions happen more easily."],
            }),
        ]);
    });

    it("never returns another course's study guide", async () => {
        const { service } = fixture();

        await service.generateStudyGuide({
            courseId: "1",
        });

        expect(await codeOf(service.getStudyGuide("2", "10"))).toBe("not_found");
    });

    it("lists study guides for an entire course", async () => {
        const { service, repository } = fixture();

        await service.listStudyGuides("1");

        expect(repository.listStudyGuides).toHaveBeenCalledWith("1", undefined);
    });

    it("lists study guides for one lecture", async () => {
        const { service, repository } = fixture();

        await service.listStudyGuides("1", "2");

        expect(repository.listStudyGuides).toHaveBeenCalledWith("1", "2");
    });

    it.each([
        ["x", undefined],
        ["0", undefined],
        ["1", "0"],
        ["1", "abc"],
    ])("rejects invalid list scope course=%s lecture=%s", async (courseId, lectureId) => {
        const { service } = fixture();

        expect(await codeOf(service.listStudyGuides(courseId, lectureId))).toBe("invalid_request");
    });

    it.each([
        ["x", "10"],
        ["1", "abc"],
        ["0", "10"],
        ["1", "0"],
    ])("rejects invalid get ids course=%s guide=%s", async (courseId, studyGuideId) => {
        const { service } = fixture();

        expect(await codeOf(service.getStudyGuide(courseId, studyGuideId))).toBe("invalid_request");
    });
});
