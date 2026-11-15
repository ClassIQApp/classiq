export interface Pricing {
    readonly inputPerMillion: number;
    readonly outputPerMillion: number;
}

export interface TokenUsage {
    readonly inputTokens: number | undefined;
    readonly outputTokens: number | undefined;
}

export function estimateCost(usage: TokenUsage, pricing: Pricing | undefined): number | undefined {
    if (!pricing || usage.inputTokens === undefined || usage.outputTokens === undefined) {
        return undefined;
    }

    return (usage.inputTokens * pricing.inputPerMillion + usage.outputTokens * pricing.outputPerMillion) / 1_000_000;
}
