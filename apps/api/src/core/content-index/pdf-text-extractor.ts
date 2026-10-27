import type { ResourcePage } from "./model.ts";
import { extractText, getDocumentProxy } from "unpdf";

/** Extracts the text layer of each page. Scanned pages without a text layer come back empty. */
export async function extractPdfPages(data: Uint8Array): Promise<ResourcePage[]> {
    const pdf = await getDocumentProxy(data);

    try {
        const { text } = await extractText(pdf, { mergePages: false });

        return text.map((pageText, index) => ({ pageNumber: index + 1, text: pageText }));
    } finally {
        await pdf.loadingTask.destroy();
    }
}
