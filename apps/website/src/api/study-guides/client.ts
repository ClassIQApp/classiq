import type { ApiFetch } from "../auth/client";

export interface StudyGuideSource {
    kind: "transcript" | "resource";
    lectureId?: string;
    resourceId?: string;
    title: string;
    pageNumber?: number;
    startSeconds?: number;
    endSeconds?: number;
}

export interface StudyGuideSection {
    id: string;
    position: number;
    heading: string;
    content: string;
    keyPoints: string[];
    sources: StudyGuideSource[];
}

export interface StudyGuideSummary {
    id: string;
    courseId: string;
    lectureId?: string;
    title: string;
    sectionCount: number;
    createdAt: string;
}

export interface StudyGuide extends StudyGuideSummary {
    overview: string;
    overviewSources: StudyGuideSource[];
    sections: StudyGuideSection[];
}

export const studyGuideQueryKey = (accountId: string, courseId: string, lectureId?: string) =>
    ["accounts", accountId, "courses", courseId, "study-guides", lectureId ?? "all"] as const;

const root = (courseId: string) => `/courses/${encodeURIComponent(courseId)}/study-guides`;

export function createStudyGuidesApi(request: ApiFetch) {
    async function list(courseId: string, lectureId?: string, signal?: AbortSignal): Promise<StudyGuideSummary[]> {
        const query = lectureId === undefined ? "" : `?lectureId=${encodeURIComponent(lectureId)}`;

        const response = await request(`${root(courseId)}${query}`, { signal });

        const data: { items: StudyGuideSummary[] } = await response.json();

        return data.items;
    }

    async function get(courseId: string, studyGuideId: string, signal?: AbortSignal): Promise<StudyGuide> {
        const response = await request(`${root(courseId)}/${encodeURIComponent(studyGuideId)}`, { signal });

        return response.json();
    }

    async function generate(courseId: string, lectureId?: string, signal?: AbortSignal): Promise<StudyGuideSummary> {
        const response = await request(root(courseId), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(lectureId === undefined ? {} : { lectureId }),
            signal,
        });

        return response.json();
    }

    async function remove(courseId: string, studyGuideId: string, signal?: AbortSignal): Promise<void> {
        await request(`${root(courseId)}/${encodeURIComponent(studyGuideId)}`, {
            method: "DELETE",
            signal,
        });
    }

    return {
        list,
        get,
        generate,
        remove,
    };
}
