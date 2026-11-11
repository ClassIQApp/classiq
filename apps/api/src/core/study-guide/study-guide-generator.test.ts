import { LlmError } from "../ai/errors.ts";
import { LlmService } from "../ai/llm-service.ts";
import type { IndexedPassage } from "../content-index/model.ts";
import { StudyGuideError } from "./errors.ts";
import type { GeneratedStudyGuide } from "./model.ts";
import { selectStudyGuidePassages, StudyGuideGenerator, type StudyGuideLlm } from "./study-guide-generator.ts";
import { describe, expect, it, vi } from "vitest";

const passages: IndexedPassage[] = [
    {
        id: "1",
        kind: "transcript",
        courseId: "1",
        lectureId: "7",
        title: "Enzymes",
        content: "Enzymes lower activation energy.",
        startSeconds: 0,
        endSeconds: 42,
    },
    {
        id: "2",
        kind: "resource",
        courseId: "1",
        resourceId: "3",
        lectureId: "7",
        title: "notes.pdf",
        content: "Inhibitors bind active sites.",
        pageNumber: 4,
    },
];

type GeneratedSection = GeneratedStudyGuide["sections"][number];

function section(overrides: Partial<GeneratedSection> = {}): GeneratedSection {
    return {
        heading: "Enzyme Function",
        content: "Enzymes help reactions by lowering activation energy.",
        keyPoints: ["Enzymes lower activation energy.", "They affect reaction rates."],
        sourceIds: ["S1"],
        ...overrides,
    };
}

function fixture(sections: GeneratedSection[] = [section()]) {
    const llm = {
        generateStructured: vi.fn<StudyGuideLlm["generateStructured"]>(async () => ({
            model: "gpt-test",
            data: {
                title: "  Enzymes Study Guide  ",
                overview: "This guide reviews enzymes and inhibitors.",
                overviewSourceIds: ["S1", "S2"],
                sections,
            },
        })),
    };

    return {
        llm,
        generator: new StudyGuideGenerator(llm),
    };
}

describe("StudyGuideGenerator", () => {
    it("returns grounded content with source snapshots and the model used", async () => {
        const { generator } = fixture([
            section(),
            section({
                heading: "Inhibitors",
                content: "Some inhibitors interact with enzyme active sites.",
                keyPoints: ["Inhibitors can bind active sites."],
                sourceIds: ["[S2]", "S1"],
            }),
        ]);

        const guide = await generator.generate(passages);

        expect(guide.title).toBe("Enzymes Study Guide");
        expect(guide.model).toBe("gpt-test");
        expect(guide.overview).toBe("This guide reviews enzymes and inhibitors.");

        expect(guide.overviewSources).toEqual([
            {
                kind: "transcript",
                lectureId: "7",
                title: "Enzymes",
                startSeconds: 0,
                endSeconds: 42,
            },
            {
                kind: "resource",
                resourceId: "3",
                lectureId: "7",
                title: "notes.pdf",
                pageNumber: 4,
            },
        ]);

        expect(guide.sections).toHaveLength(2);

        expect(guide.sections[0]!.sources).toEqual([
            {
                kind: "transcript",
                lectureId: "7",
                title: "Enzymes",
                startSeconds: 0,
                endSeconds: 42,
            },
        ]);

        expect(guide.sections[1]!.sources).toEqual([
            {
                kind: "resource",
                resourceId: "3",
                lectureId: "7",
                title: "notes.pdf",
                pageNumber: 4,
            },
            expect.objectContaining({
                kind: "transcript",
            }),
        ]);
    });

    it("labels passages as course material with their source locations", async () => {
        const { llm, generator } = fixture();

        await generator.generate(passages);

        const [request] = llm.generateStructured.mock.calls[0]!;

        const [system, user] = request.messages.map((message) => message.content);

        expect(system).toMatch(/not instructions/);
        expect(system).toMatch(/only the supplied course material/i);

        expect(user).toContain("[S1] Enzymes (0:00–0:42)\nEnzymes lower activation energy.");

        expect(user).toContain("[S2] notes.pdf (page 4)\nInhibitors bind active sites.");
    });

    it.each([
        [
            "an empty heading",
            {
                heading: " ",
            },
        ],
        [
            "empty content",
            {
                content: " ",
            },
        ],
        [
            "no key points",
            {
                keyPoints: [],
            },
        ],
        [
            "no sources",
            {
                sourceIds: [],
            },
        ],
        [
            "only unknown sources",
            {
                sourceIds: ["S99"],
            },
        ],
    ])("drops sections with %s", async (_, overrides) => {
        const { generator } = fixture([
            section({
                heading: "Kept Section",
            }),
            section({
                heading: "Dropped Section",
                ...overrides,
            }),
        ]);

        const guide = await generator.generate(passages);

        expect(guide.sections.map((item) => item.heading)).toEqual(["Kept Section"]);
    });

    it("drops duplicate section headings", async () => {
        const { generator } = fixture([
            section({
                heading: "Enzymes",
            }),
            section({
                heading: "enzymes",
            }),
            section({
                heading: "Inhibitors",
                sourceIds: ["S2"],
            }),
        ]);

        const guide = await generator.generate(passages);

        expect(guide.sections.map((item) => item.heading)).toEqual(["Enzymes", "Inhibitors"]);
    });

    it("ignores unknown source ids when valid sources are also present", async () => {
        const { generator } = fixture([
            section({
                sourceIds: ["S1", "S999"],
            }),
        ]);

        const guide = await generator.generate(passages);

        expect(guide.sections[0]!.sources).toHaveLength(1);
        expect(guide.sections[0]!.sources[0]).toMatchObject({
            kind: "transcript",
            lectureId: "7",
        });
    });

    it("fails when the overview has no valid source", async () => {
        const { llm, generator } = fixture();

        llm.generateStructured.mockResolvedValueOnce({
            model: "gpt-test",
            data: {
                title: "Enzymes",
                overview: "Overview",
                overviewSourceIds: ["S99"],
                sections: [section()],
            },
        });

        await expect(generator.generate(passages)).rejects.toEqual(new StudyGuideError("generation_failed"));
    });

    it("fails when no usable sections are generated", async () => {
        const { generator } = fixture([
            section({
                sourceIds: [],
            }),
        ]);

        await expect(generator.generate(passages)).rejects.toEqual(new StudyGuideError("generation_failed"));
    });

    it("reports no content when no passages are supplied", async () => {
        const { llm, generator } = fixture();

        await expect(generator.generate([])).rejects.toEqual(new StudyGuideError("no_content"));

        expect(llm.generateStructured).not.toHaveBeenCalled();
    });

    it("propagates LLM failures", async () => {
        const { llm, generator } = fixture();

        llm.generateStructured.mockRejectedValueOnce(new LlmError("timeout"));

        await expect(generator.generate(passages)).rejects.toBeInstanceOf(LlmError);
    });

    it("falls back to a default title", async () => {
        const { llm, generator } = fixture();

        llm.generateStructured.mockResolvedValueOnce({
            model: "gpt-test",
            data: {
                title: " ",
                overview: "Overview of enzymes.",
                overviewSourceIds: ["S1"],
                sections: [section()],
            },
        });

        const guide = await generator.generate(passages);

        expect(guide.title).toBe("Study guide");
    });
});

describe("selectStudyGuidePassages", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
        ...passages[0]!,
        id: String(index),
        content: "x".repeat(100),
    }));

    it("keeps everything that fits", () => {
        expect(selectStudyGuidePassages(many, 1000)).toHaveLength(10);
    });

    it("samples evenly across material that is too large", () => {
        const selected = selectStudyGuidePassages(many, 500);

        expect(selected.map((passage) => passage.id)).toEqual(["0", "2", "4", "6", "8"]);
    });

    it("always keeps at least one passage when content exists", () => {
        expect(selectStudyGuidePassages(many, 10)).toHaveLength(1);
    });

    it("returns nothing when there are no passages", () => {
        expect(selectStudyGuidePassages([], 1000)).toEqual([]);
    });
});

describe("StudyGuideLlm", () => {
    it("is satisfied by LlmService", () => {
        const llm: StudyGuideLlm = new LlmService({
            provider: "openai",
            generate: vi.fn(),
        });

        expect(llm).toBeDefined();
    });
});
