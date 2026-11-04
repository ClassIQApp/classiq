export interface TimeSpan {
    startSeconds: number;
    endSeconds: number;
}
export interface ChunkPlan extends TimeSpan {
    position: number;
    audioStartSeconds: number;
}
export interface ChunkOptions {
    targetSeconds: number;
    singleChunkMaxSeconds: number;
    windowSeconds: number;
    overlapSeconds: number;
}
export const defaultChunkOptions: ChunkOptions = {
    targetSeconds: 1800,
    singleChunkMaxSeconds: 2400,
    windowSeconds: 180,
    overlapSeconds: 5,
};

export function planChunks(duration: number, silences: readonly TimeSpan[], options = defaultChunkOptions): ChunkPlan[] {
    if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        Object.values(options).some((value) => !Number.isFinite(value) || value < 0) ||
        options.targetSeconds <= 0 ||
        options.singleChunkMaxSeconds <= 0 ||
        options.windowSeconds >= options.targetSeconds / 2
    )
        throw new Error("Invalid recording duration or chunk options.");
    if (
        silences.some(
            (span) =>
                span.startSeconds < 0 ||
                span.endSeconds < span.startSeconds ||
                span.endSeconds > duration ||
                !Number.isFinite(span.startSeconds + span.endSeconds),
        )
    )
        throw new Error("Invalid silence span.");
    const count = duration <= options.singleChunkMaxSeconds ? 1 : Math.ceil(duration / options.targetSeconds);
    if (count > 1 && options.windowSeconds >= duration / count / 2) throw new Error("Chunk silence windows overlap.");
    const cuts = [0];
    for (const index of Array.from({ length: count - 1 }, (_, index) => index + 1)) {
        const ideal = (index * duration) / count;
        const candidates = silences
            .filter((span) => Math.abs((span.startSeconds + span.endSeconds) / 2 - ideal) <= options.windowSeconds)
            .toSorted((a, b) => b.endSeconds - b.startSeconds - (a.endSeconds - a.startSeconds) || a.startSeconds - b.startSeconds);
        const silence = candidates[0];
        const cut = silence ? (silence.startSeconds + silence.endSeconds) / 2 : ideal;
        cuts.push(cut > cuts.at(-1)! && cut < duration ? cut : ideal);
    }
    cuts.push(duration);

    return cuts.slice(0, -1).map((startSeconds, position) => ({
        position,
        startSeconds,
        endSeconds: cuts[position + 1]!,
        audioStartSeconds: Math.max(0, startSeconds - options.overlapSeconds),
    }));
}
