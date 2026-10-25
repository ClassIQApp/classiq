export type LectureStatus = "ready" | "processing" | "failed";

export interface LectureContentLink {
    id: string;
    title: string;
    description: string;
    href: string;
}

export interface Lecture {
    id: string;
    title: string;
    description: string;
    status: LectureStatus;
    statusMessage: string;
    transcript?: LectureContentLink;
    resources: LectureContentLink[];
    generatedContent: LectureContentLink[];
}

/* API response when requesting lectures for a course */
export interface ListCourseLecturesResponse {
    items: Lecture[];
}

/* Standard error returned by lecture API endpoints */
export interface LectureApiError {
    code: string;
    message: string;
}
