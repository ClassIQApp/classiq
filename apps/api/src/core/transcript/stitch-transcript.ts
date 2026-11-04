import { PermanentStageError } from "../processing/pipeline.ts";
import type { ChunkPlan } from "../recording/chunk-planner.ts";
import { tokenSchema, type SpeechToken, type TranscriptToken, type Transcript } from "./model.ts";
import { createHash } from "node:crypto";

export interface CollectedChunk extends ChunkPlan {
    tokens: TranscriptToken[];
}
export function stitchTranscript(recordingId: string, chunks: readonly CollectedChunk[], provider: string, model: string): Transcript {
    const segments: Transcript["segments"] = [];
    let translationStatus: Transcript["translationStatus"] = "succeeded";
    let nextSpeaker = 1;
    let previous: { token: SpeechToken; absolute: number; label?: string }[] = [];
    let previousDominant: string | undefined;
    const ordered = [...chunks].toSorted((a, b) => a.position - b.position);
    for (const chunk of ordered) {
        const tokens = chunk.tokens.map((token) => tokenSchema.parse(token));
        const speech = tokens.filter((token): token is SpeechToken => token.kind === "speech");
        if (speech.some((token) => token.endSeconds + chunk.audioStartSeconds > chunk.endSeconds + 0.001))
            throw new PermanentStageError("INVALID_TRANSCRIPT", "Transcription times exceed the recording.");
        const labels = new Map<string, string>();
        const durations = new Map<string, number>();
        for (const token of speech)
            if (token.speaker) durations.set(token.speaker, (durations.get(token.speaker) ?? 0) + token.endSeconds - token.startSeconds);
        for (const speaker of durations.keys()) {
            const votes = new Map<string, number>();
            const matched = new Set<number>();
            for (const token of speech.filter((token) => token.speaker === speaker)) {
                const matchIndex = previous.findIndex(
                    (old, index) =>
                        !matched.has(index) &&
                        old.label &&
                        old.token.text.trim().toLowerCase() === token.text.trim().toLowerCase() &&
                        Math.abs(old.absolute - (chunk.audioStartSeconds + token.startSeconds)) <= 0.3,
                );
                const match = previous[matchIndex];
                if (match?.label) {
                    matched.add(matchIndex);
                    votes.set(match.label, (votes.get(match.label) ?? 0) + 1);
                }
            }
            const best = [...votes].toSorted((a, b) => b[1] - a[1])[0];
            if (best && best[1] >= 5 && ![...labels.values()].includes(best[0])) labels.set(speaker, best[0]);
        }
        const dominant = [...durations].toSorted((a, b) => b[1] - a[1])[0]?.[0];
        if (dominant && !labels.has(dominant) && previousDominant && ![...labels.values()].includes(previousDominant))
            labels.set(dominant, previousDominant);
        for (const speaker of durations.keys()) if (!labels.has(speaker)) labels.set(speaker, `S${nextSpeaker++}`);
        let run: SpeechToken[] = [];
        let translations: string[] = [];
        const flush = () => {
            if (run.length === 0) {
                if (translations.length > 0) translationStatus = "failed";
                translations = [];

                return;
            }
            const owned = run.filter((token) => {
                const start = token.startSeconds + chunk.audioStartSeconds;

                return start >= chunk.startSeconds && start < chunk.endSeconds;
            });
            // A translation spanning discarded overlap cannot be assigned faithfully to the retained words.
            const aligned = owned.length === run.length;
            const spanish = translations.join("").trim();
            let group: SpeechToken[] = [];
            const emit = (last: boolean) => {
                if (group.length === 0) return;
                const first = group[0]!;
                const languageDurations = new Map<string, number>();
                for (const token of group)
                    languageDurations.set(
                        token.language,
                        (languageDurations.get(token.language) ?? 0) + token.endSeconds - token.startSeconds,
                    );
                const language = [...languageDurations].toSorted((a, b) => b[1] - a[1])[0]![0];
                segments.push({
                    text: group
                        .map((token) => token.text)
                        .join("")
                        .trim(),
                    startSeconds: first.startSeconds + chunk.audioStartSeconds,
                    endSeconds: group.at(-1)!.endSeconds + chunk.audioStartSeconds,
                    language,
                    speakerLabel: first.speaker ? labels.get(first.speaker) : undefined,
                    ...(last && aligned && spanish && language !== "es" ? { spanish } : {}),
                });
                if (language !== "es" && (!last || !aligned || !spanish)) translationStatus = "failed";
                group = [];
            };
            for (const token of owned) {
                if (
                    group.length > 0 &&
                    (token.speaker !== group[0]!.speaker ||
                        token.language !== group[0]!.language ||
                        (token.startSeconds - group[0]!.startSeconds > 30 && /[.!?]\s*$/.test(group.at(-1)!.text)))
                )
                    emit(false);
                group.push(token);
            }
            emit(true);
            run = [];
            translations = [];
        };
        for (const token of tokens) {
            if (token.kind === "translation") translations.push(token.text);
            else {
                if (translations.length > 0) flush();
                run.push(token);
            }
        }
        flush();
        previous = speech.map((token) => ({
            token,
            absolute: token.startSeconds + chunk.audioStartSeconds,
            label: token.speaker ? labels.get(token.speaker) : undefined,
        }));
        previousDominant = dominant ? labels.get(dominant) : undefined;
    }
    if (segments.length === 0) throw new PermanentStageError("NO_SPEECH", "No speech was detected in the recording.");
    const durations = new Map<string, number>();
    for (const segment of segments)
        durations.set(segment.language, (durations.get(segment.language) ?? 0) + segment.endSeconds - segment.startSeconds);
    // Include alignment and Spanish text so changed translations cannot be hidden by a source-only hash.
    const contentHash = createHash("sha256").update(JSON.stringify({ segments, translationStatus })).digest("hex");

    return {
        recordingId,
        durationSeconds: ordered.at(-1)!.endSeconds,
        language: [...durations].toSorted((a, b) => b[1] - a[1])[0]![0],
        contentHash,
        provider,
        model,
        translationStatus,
        segments,
    };
}
