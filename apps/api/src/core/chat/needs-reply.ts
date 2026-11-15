const MIN_WORDS = 3;

const QUESTION_STARTERS = new Set([
    "what",
    "whats",
    "why",
    "how",
    "when",
    "where",
    "which",
    "who",
    "whom",
    "whose",
    "explain",
    "define",
    "describe",
    "summarize",
    "summarise",
    "can",
    "could",
    "does",
    "do",
    "did",
    "is",
    "are",
    "will",
    "would",
    "should",
]);

export function needsReply(body: string): boolean {
    const text = body.trim();
    const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

    if (words.length < MIN_WORDS) {
        return false;
    }

    return text.endsWith("?") || QUESTION_STARTERS.has(words[0]!.replaceAll("'", ""));
}
