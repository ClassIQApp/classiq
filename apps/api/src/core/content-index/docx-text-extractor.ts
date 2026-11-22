import type { ResourcePage } from "./model.ts";
import type { XmlElement } from "./office-package.ts";
import { childNamed, descendantsNamed, parseXmlPart, readPackageParts, textWithin } from "./office-package.ts";

const DOCUMENT_PART = "word/document.xml";
const SECTION_TARGET_CHARS = 3000;
const HEADING_STYLE = /^(heading\s*\d|title|subtitle)/i;
const NO_OUTLINE_LEVEL = "9";
const INLINE_SEPARATORS = { "w:tab": " ", "w:br": " ", "w:cr": " " };

interface Paragraph {
    readonly text: string;
    readonly heading: boolean;
}

/** Splits a Word document into sections: each heading starts one, and long runs of body text are cut so a section stays about a page. */
export function extractDocxPages(data: Uint8Array): ResourcePage[] {
    const parts = readPackageParts(data, (name) => name === DOCUMENT_PART);
    const body = childNamed(parseXmlPart(parts, DOCUMENT_PART), "w:body");

    if (!body) {
        return [];
    }

    return groupSections(descendantsNamed(body, "w:p").map((paragraph) => toParagraph(paragraph))).map((texts, index) => ({
        pageNumber: index + 1,
        text: texts.join("\n"),
    }));
}

function toParagraph(paragraph: XmlElement): Paragraph {
    return {
        text: textWithin(paragraph, "w:t", INLINE_SEPARATORS).trim(),
        heading: isHeading(childNamed(paragraph, "w:pPr")),
    };
}

function isHeading(properties: XmlElement | undefined): boolean {
    if (!properties) {
        return false;
    }

    const style = childNamed(properties, "w:pStyle")?.attributes["w:val"] ?? "";
    const outlineLevel = childNamed(properties, "w:outlineLvl")?.attributes["w:val"];

    return HEADING_STYLE.test(style) || (outlineLevel !== undefined && outlineLevel !== NO_OUTLINE_LEVEL);
}

function groupSections(paragraphs: readonly Paragraph[]): string[][] {
    return paragraphs
        .filter((paragraph) => paragraph.text !== "")
        .reduce<string[][]>((sections, paragraph) => {
            const current = sections.at(-1);
            const startsSection =
                current === undefined ||
                paragraph.heading ||
                current.reduce((length, text) => length + text.length, 0) >= SECTION_TARGET_CHARS;

            return startsSection ? [...sections, [paragraph.text]] : [...sections.slice(0, -1), [...current, paragraph.text]];
        }, []);
}
