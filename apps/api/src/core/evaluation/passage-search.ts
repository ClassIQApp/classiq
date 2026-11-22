export interface Passage {
    readonly label: string;
    readonly text: string;
}

export interface PassageHit extends Passage {
    readonly score: number;
}

export interface PassageIndex {
    readonly passages: readonly Passage[];
    readonly termCounts: readonly Map<string, number>[];
    readonly lengths: readonly number[];
    readonly averageLength: number;
    readonly documentFrequency: Map<string, number>;
}

const STOP_WORDS = new Set(
    "the and for that this with from have your you are was were will what when which their there they them these those then than into over also not but can all any each our one two out use used using about would should could may might more most other some such only just like how why who whom whose its is be been being to of in on at by as or if an a i we do does did so no yes".split(
        " ",
    ),
);

export function tokenize(text: string): string[] {
    return (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? []).filter((word) => !STOP_WORDS.has(word));
}

export function buildIndex(passages: readonly Passage[]): PassageIndex {
    const termCounts = passages.map((passage) =>
        tokenize(passage.text).reduce((counts, word) => counts.set(word, (counts.get(word) ?? 0) + 1), new Map<string, number>()),
    );
    const lengths = termCounts.map((counts) => [...counts.values()].reduce((total, count) => total + count, 0));
    const documentFrequency = termCounts.reduce((frequency, counts) => {
        for (const word of counts.keys()) {
            frequency.set(word, (frequency.get(word) ?? 0) + 1);
        }

        return frequency;
    }, new Map<string, number>());

    return {
        passages,
        termCounts,
        lengths,
        averageLength: lengths.reduce((total, length) => total + length, 0) / Math.max(lengths.length, 1),
        documentFrequency,
    };
}

export function search(index: PassageIndex, query: string, limit = 3): PassageHit[] {
    const terms = [...new Set(tokenize(query))];
    const k1 = 1.4;
    const b = 0.75;

    return index.passages
        .map((passage, position) => {
            const counts = index.termCounts[position]!;
            const length = index.lengths[position]!;
            const score = terms.reduce((total, term) => {
                const frequency = counts.get(term) ?? 0;
                const matching = index.documentFrequency.get(term) ?? 0;
                const idf = Math.log(1 + (index.passages.length - matching + 0.5) / (matching + 0.5));

                return (
                    total +
                    (frequency === 0 ? 0 : (idf * frequency * (k1 + 1)) / (frequency + k1 * (1 - b + (b * length) / index.averageLength)))
                );
            }, 0);

            return { ...passage, score };
        })
        .filter((hit) => hit.score > 0)
        .toSorted((first, second) => second.score - first.score)
        .slice(0, limit);
}
