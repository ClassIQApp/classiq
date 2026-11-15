export type Yes = "yes" | "no" | undefined;
export type Correctness = "correct" | "partial" | "incorrect" | undefined;

export interface ScoredAnswer {
    readonly condition: string;
    readonly lecture: string;
    readonly category: string;
    readonly correctness: Correctness;
    readonly unsupportedClaim: Yes;
    readonly correctDecline: Yes;
    readonly sourceSupport: Yes;
    readonly latencyMs?: number;
    readonly costUsd?: number;
    readonly contextCharacters?: number;
}

export interface ScoredQuestion {
    readonly condition: string;
    readonly lecture: string;
    readonly singleCorrect: Yes;
    readonly keyOk: Yes;
    readonly explanationOk: Yes;
    readonly duplicate: Yes;
    readonly supported: Yes;
}

export interface Proportion {
    readonly count: number;
    readonly total: number;
}

const YES = new Set(["y", "yes", "true", "1"]);
const NO = new Set(["n", "no", "false", "0"]);

export function parseYes(value: string): Yes {
    const normalized = value.trim().toLowerCase();

    return YES.has(normalized) ? "yes" : NO.has(normalized) ? "no" : undefined;
}

export function parseCorrectness(value: string): Correctness {
    const normalized = value.trim().toLowerCase();

    return normalized.startsWith("c")
        ? "correct"
        : normalized.startsWith("p")
          ? "partial"
          : normalized.startsWith("i")
            ? "incorrect"
            : undefined;
}

export function proportion<T>(rows: readonly T[], answered: (row: T) => boolean | undefined): Proportion {
    const decided = rows.map((row) => answered(row)).filter((value): value is boolean => value !== undefined);

    return { count: decided.filter(Boolean).length, total: decided.length };
}

export function wilsonInterval({ count, total }: Proportion): readonly [number, number] {
    if (total === 0) {
        return [0, 0];
    }

    const z = 1.96;
    const rate = count / total;
    const denominator = 1 + (z * z) / total;
    const center = (rate + (z * z) / (2 * total)) / denominator;
    const margin = (z * Math.sqrt((rate * (1 - rate)) / total + (z * z) / (4 * total * total))) / denominator;

    return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function formatProportion(value: Proportion, withInterval = false): string {
    if (value.total === 0) {
        return "n/a";
    }

    const percent = `${((100 * value.count) / value.total).toFixed(0)}% (${value.count}/${value.total}`;
    const [low, high] = wilsonInterval(value);

    return withInterval ? `${percent}; 95% CI ${(100 * low).toFixed(0)} to ${(100 * high).toFixed(0)})` : `${percent})`;
}

export function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
    return rows.reduce((groups, row) => groups.set(key(row), [...(groups.get(key(row)) ?? []), row]), new Map<string, T[]>());
}

export const isFullyValid = (question: ScoredQuestion): boolean | undefined => {
    const checks = [question.singleCorrect, question.keyOk, question.explanationOk, question.supported, question.duplicate];

    return checks.includes(undefined)
        ? undefined
        : question.singleCorrect === "yes" &&
              question.keyOk === "yes" &&
              question.explanationOk === "yes" &&
              question.supported === "yes" &&
              question.duplicate === "no";
};
