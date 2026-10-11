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

export interface Course {
    id: string;
    code: string;
    name: string;
    description: string;
    lectures: Lecture[];
}
