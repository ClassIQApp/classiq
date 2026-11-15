const MAX_OVERLAP_CHARS = 200;

function overlapLength(text: string, chunk: string): number | undefined {
    const limit = Math.min(MAX_OVERLAP_CHARS, text.length, chunk.length);

    return Array.from({ length: limit }, (_, index) => limit - index).find((length) => {
        const startsUnit = text.length === length || text[text.length - length - 1] === " ";
        const endsUnit = chunk.length === length || chunk[length] === " ";

        return startsUnit && endsUnit && text.endsWith(chunk.slice(0, length));
    });
}

export function joinOverlappingChunks(chunks: readonly string[]): string {
    return chunks.reduce((text, chunk) => {
        if (text === "") {
            return chunk;
        }

        const overlap = overlapLength(text, chunk);

        return overlap === undefined ? `${text} ${chunk}` : text + chunk.slice(overlap);
    }, "");
}
