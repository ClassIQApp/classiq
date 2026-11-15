import type { ApiFetch } from "../auth/client";

export interface AnswerSource {
    kind: "transcript" | "resource";
    lectureId?: string;
    resourceId?: string;
    title: string;
    pageNumber?: number;
    startSeconds?: number;
    endSeconds?: number;
}

export interface CourseAnswer {
    answerable: boolean;
    answer: string;
    sources: AnswerSource[];
}

export function createQuestionsApi(request: ApiFetch) {
    async function ask(courseId: string, question: string, lectureId?: string, signal?: AbortSignal): Promise<CourseAnswer> {
        const response = await request(`/courses/${encodeURIComponent(courseId)}/questions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                question,
                ...(lectureId === undefined ? {} : { lectureId }),
            }),
            signal,
        });

        return response.json();
    }

    return { ask };
}
