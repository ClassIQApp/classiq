import { extractDocxPages } from "./docx-text-extractor.ts";
import { UnreadableResourceError } from "./errors.ts";
import { extractPptxPages } from "./pptx-text-extractor.ts";
import { createTestDocx, createTestPptx } from "./test-office.ts";
import { describe, expect, it } from "vitest";

describe("extractPptxPages", () => {
    it("returns one page per slide in presentation order, keeping blank slides numbered", () => {
        const pages = extractPptxPages(createTestPptx([["Photosynthesis", "Light reactions"], [], ["Calvin cycle"]]));

        expect(pages).toEqual([
            { pageNumber: 1, text: "Photosynthesis\nLight reactions" },
            { pageNumber: 2, text: "" },
            { pageNumber: 3, text: "Calvin cycle" },
        ]);
    });
});

describe("extractDocxPages", () => {
    it("starts a new section at every heading", () => {
        const pages = extractDocxPages(
            createTestDocx([
                { text: "Intro paragraph" },
                { text: "Cell biology", style: "Heading1" },
                { text: "Membranes & transport" },
                { text: "Genetics", style: "Heading2" },
                { text: "Alleles" },
            ]),
        );

        expect(pages).toEqual([
            { pageNumber: 1, text: "Intro paragraph" },
            { pageNumber: 2, text: "Cell biology\nMembranes & transport" },
            { pageNumber: 3, text: "Genetics\nAlleles" },
        ]);
    });

    it("cuts long text without headings into page-sized sections", () => {
        const paragraphs = Array.from({ length: 8 }, (_, index) => ({ text: `${index} ${"word ".repeat(150)}` }));

        expect(extractDocxPages(createTestDocx(paragraphs)).map((page) => page.pageNumber)).toEqual([1, 2]);
    });
});

describe("unreadable Office files", () => {
    it("rejects a package that expands far beyond the upload cap", () => {
        const bomb = createTestDocx([{ text: "a".repeat(30 * 1024 ** 2) }]);

        expect(() => extractDocxPages(bomb)).toThrow(UnreadableResourceError);
    });

    it("rejects a package without the expected parts", () => {
        expect(() => extractPptxPages(createTestDocx([{ text: "Not a deck" }]))).toThrow(UnreadableResourceError);
    });
});
