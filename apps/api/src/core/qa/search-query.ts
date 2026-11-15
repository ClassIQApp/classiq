const MAX_TERMS = 20;

const IGNORED_WORDS = new Set(
    [
        "a an and are as at be but by can could did do does for from had has have how i if in into is it its me my of on or not our so than that the their them then there these they this to us was we were what when where which who why will with would you your",
        "about explain tell describe mean means say said according lecture course class",
    ]
        .join(" ")
        .split(" "),
);

export function toSearchQuery(question: string): string | undefined {
    const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const terms = [...new Set(words.filter((word) => word.length > 1 && !IGNORED_WORDS.has(word)))].slice(0, MAX_TERMS);

    return terms.length === 0 ? undefined : terms.join(" or ");
}
