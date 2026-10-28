import type { ApiFetch } from "../auth/client";

export async function recordingAccess(apiFetch: ApiFetch, courseId: string, lectureId: string, signal: AbortSignal) {
    const root = `/courses/${courseId}/lectures/${lectureId}/recording`;
    const [metadataResponse, downloadResponse] = await Promise.all([apiFetch(root, { signal }), apiFetch(`${root}/download`, { signal })]);
    const metadata: { contentType: string; name: string } = await metadataResponse.json();
    const download: { url: string; expiresAt: string } = await downloadResponse.json();

    return { ...metadata, ...download };
}
