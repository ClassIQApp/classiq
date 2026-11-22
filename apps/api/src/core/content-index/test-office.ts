import { strToU8, zipSync } from "fflate";

export interface TestParagraph {
    readonly text: string;
    readonly style?: string;
}

const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

/** Builds a minimal Word package whose body holds the given paragraphs. */
export function createTestDocx(paragraphs: readonly TestParagraph[]): Uint8Array {
    const body = paragraphs
        .map(
            ({ text, style }) =>
                `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`,
        )
        .join("");

    return zipSync({
        "[Content_Types].xml": strToU8("<Types/>"),
        "word/document.xml": strToU8(
            `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
        ),
    });
}

/** Builds a minimal PowerPoint package with one slide per entry, stored out of order to prove the deck order is used. */
export function createTestPptx(slides: readonly (readonly string[])[]): Uint8Array {
    const slideFiles = Object.fromEntries(
        slides.map((paragraphs, index) => [
            `ppt/slides/slide${slides.length - index}.xml`,
            strToU8(
                `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody>${paragraphs
                    .map((text) => `<a:p><a:r><a:t>${escape(text)}</a:t></a:r></a:p>`)
                    .join("")}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
            ),
        ]),
    );
    const relationships = slides
        .map((_, index) => `<Relationship Id="rId${index + 10}" Target="slides/slide${slides.length - index}.xml"/>`)
        .join("");
    const slideIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 10}"/>`).join("");

    return zipSync({
        ...slideFiles,
        "ppt/_rels/presentation.xml.rels": strToU8(`<Relationships>${relationships}</Relationships>`),
        "ppt/presentation.xml": strToU8(`<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`),
    });
}
