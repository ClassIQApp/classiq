export const MAX_RESOURCE_BYTES = 25 * 1024 ** 2;

export type ResourceFormat = "pdf" | "docx" | "pptx";

const contentTypes: Record<ResourceFormat, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const resourceFormatLabels: Record<ResourceFormat, string> = {
    pdf: "PDF",
    docx: "Word",
    pptx: "PowerPoint",
};

export const RESOURCE_FILE_ACCEPT = [".pdf", ".docx", ".pptx", ...Object.values(contentTypes)].join(",");

export function resourceFormatOfName(name: string): ResourceFormat | undefined {
    const extension = name.toLowerCase().split(".").at(-1);

    return (Object.keys(contentTypes) as ResourceFormat[]).find((format) => format === extension);
}

export function resourceFormatOfContentType(contentType: string | undefined): ResourceFormat {
    return (Object.keys(contentTypes) as ResourceFormat[]).find((format) => contentTypes[format] === contentType) ?? "pdf";
}

export function resourceContentType(file: Pick<File, "name">): string {
    return contentTypes[resourceFormatOfName(file.name) ?? "pdf"];
}
