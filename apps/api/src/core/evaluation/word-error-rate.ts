export interface WordErrorRate {
    readonly referenceWords: number;
    readonly substitutions: number;
    readonly deletions: number;
    readonly insertions: number;
    readonly rate: number;
}

export function normalizeWords(text: string): string[] {
    return text.toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
}

export function wordErrorRate(reference: string, hypothesis: string): WordErrorRate {
    const expected = normalizeWords(reference);
    const actual = normalizeWords(hypothesis);

    if (expected.length === 0) {
        throw new RangeError("The reference has no words");
    }

    const costs = expected.reduce<number[][]>(
        (rows, word, rowIndex) => {
            const previous = rows[rowIndex]!;
            const row = [rowIndex + 1];

            for (const [column, other] of actual.entries()) {
                row.push(Math.min(previous[column]! + (word === other ? 0 : 1), previous[column + 1]! + 1, row[column]! + 1));
            }

            return [...rows, row];
        },
        [Array.from({ length: actual.length + 1 }, (_, column) => column)],
    );

    let substitutions = 0;
    let deletions = 0;
    let insertions = 0;
    let row = expected.length;
    let column = actual.length;

    while (row > 0 || column > 0) {
        const here = costs[row]![column]!;
        const same = row > 0 && column > 0 && expected[row - 1] === actual[column - 1];

        if (row > 0 && column > 0 && here === costs[row - 1]![column - 1]! + (same ? 0 : 1)) {
            substitutions += same ? 0 : 1;
            row--;
            column--;
        } else if (row > 0 && here === costs[row - 1]![column]! + 1) {
            deletions++;
            row--;
        } else {
            insertions++;
            column--;
        }
    }

    return {
        referenceWords: expected.length,
        substitutions,
        deletions,
        insertions,
        rate: (substitutions + deletions + insertions) / expected.length,
    };
}
