const MAX_TERMS = 20;

/** Words that carry no topic, plus the words websearch queries treat as operators. */
const IGNORED_WORDS = new Set(
    [
        "a an and are as at be but by can could did do does for from had has have how i if in into is it its me my of on or not our so than that the their them then there these they this to us was we were what when where which who why will with would you your",
        "about explain tell describe mean means say said according lecture course class",
    ]
        .join(" ")
        .split(" "),
);

/**
 * Turns a natural-language question into an OR query over its content words. The index treats plain
 * terms as AND, so a full sentence would match almost nothing; with OR, ranking favors passages that
 * contain more of the question's terms.
 */
export function toSearchQuery(question: string): string | undefined {
    const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const terms = [...new Set(words.filter((word) => word.length > 1 && !IGNORED_WORDS.has(word)))].slice(0, MAX_TERMS);

    return terms.length === 0 ? undefined : terms.join(" or ");
}
