import { UnreadableResourceError } from "./errors.ts";
import type { ResourcePage } from "./model.ts";
import { descendantsNamed, parseXmlPart, readPackageParts, textWithin } from "./office-package.ts";
import path from "node:path";

const PRESENTATION_PART = "ppt/presentation.xml";
const PRESENTATION_RELATIONSHIPS_PART = "ppt/_rels/presentation.xml.rels";
const SLIDE_PART = /^ppt\/slides\/[^/]+\.xml$/;
const SLIDE_RELATIONSHIP_ID = "r:id";
const LINE_BREAKS = { "a:br": " " };

/** Extracts the text of every slide in presentation order, so a page number is the slide's position in the deck. */
export function extractPptxPages(data: Uint8Array): ResourcePage[] {
    const parts = readPackageParts(
        data,
        (name) => name === PRESENTATION_PART || name === PRESENTATION_RELATIONSHIPS_PART || SLIDE_PART.test(name),
    );
    const targets = new Map(
        descendantsNamed(parseXmlPart(parts, PRESENTATION_RELATIONSHIPS_PART), "Relationship").map((relationship) => [
            relationship.attributes["Id"],
            relationship.attributes["Target"] ?? "",
        ]),
    );

    return descendantsNamed(parseXmlPart(parts, PRESENTATION_PART), "p:sldId").map((slide, index) => {
        const target = targets.get(slide.attributes[SLIDE_RELATIONSHIP_ID]);

        if (target === undefined) {
            throw new UnreadableResourceError("corrupt");
        }

        const slideRoot = parseXmlPart(parts, resolveSlidePart(target));
        const text = descendantsNamed(slideRoot, "a:p")
            .map((paragraph) => textWithin(paragraph, "a:t", LINE_BREAKS).trim())
            .filter((paragraphText) => paragraphText !== "")
            .join("\n");

        return { pageNumber: index + 1, text };
    });
}

function resolveSlidePart(target: string): string {
    return target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join("ppt", target));
}
