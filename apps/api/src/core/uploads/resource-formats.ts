export const MAX_RESOURCE_BYTES = 25 * 1024 ** 2;

export const RESOURCE_CONTENT_TYPES = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

export type ResourceFormat = keyof typeof RESOURCE_CONTENT_TYPES;

export const resourceFormatLabels: Record<ResourceFormat, string> = {
    pdf: "PDF",
    docx: "Word document",
    pptx: "PowerPoint presentation",
};

export const resourceContentTypes = Object.values(RESOURCE_CONTENT_TYPES) as [string, ...string[]];

export function resourceFormatOf(contentType: string): ResourceFormat | undefined {
    return (Object.keys(RESOURCE_CONTENT_TYPES) as ResourceFormat[]).find((format) => RESOURCE_CONTENT_TYPES[format] === contentType);
}
