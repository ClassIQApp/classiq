import type { LlmCompletion, LlmProviderName, LlmRequest } from "./model.ts";
import type * as z from "zod/mini";

export interface LlmRepositoryRequest<T> extends LlmRequest {
    readonly output?: z.ZodMiniType<T>;
}

export interface LlmRepository {
    readonly provider: LlmProviderName;

    generate<T>(request: LlmRepositoryRequest<T>, signal: AbortSignal): Promise<LlmCompletion>;
}
