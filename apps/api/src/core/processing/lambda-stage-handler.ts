import { assertPayload, PermanentStageError, RetryableStageError, stageFailure, type Execution, type StageHandler } from "./pipeline.ts";
import { z } from "zod";

const failureSchema = z.object({ code: z.string(), message: z.string() });
const caughtFailureSchema = z.object({ Error: z.string(), Cause: z.string() });

export function readFailure(failure: Execution<unknown>["failure"]) {
    if (!failure) {
        return undefined;
    }
    if (!["RetryableStageError", "PermanentStageError"].includes(failure.Error)) {
        return stageFailure(undefined);
    }
    // Lambda wraps a thrown error's message in its own JSON Cause object.
    try {
        const cause: unknown = JSON.parse(failure.Cause);
        const wrapped = z.object({ errorMessage: z.string() }).safeParse(cause);

        return failureSchema.parse(wrapped.success ? JSON.parse(wrapped.data.errorMessage) : cause);
    } catch {
        return stageFailure(undefined);
    }
}

export function executionSchema<S>(input: z.ZodType<S>) {
    return z.object({ runId: z.string().min(1), input, failure: caughtFailureSchema.optional() });
}

export function lambdaStageHandler<S>(handler: StageHandler<S>, input: z.ZodType<S>) {
    const eventSchema = z.object({
        envelope: executionSchema(input),
        retryCount: z.int().nonnegative(),
        timeoutSeconds: z.int().positive(),
    });

    return async (event: unknown, context: { getRemainingTimeInMillis(): number }): Promise<Execution<S>> => {
        assertPayload(event);
        const { envelope, retryCount, timeoutSeconds } = eventSchema.parse(event);

        try {
            const result = await handler(envelope.input, {
                runId: envelope.runId,
                attempt: retryCount + 1,
                deadline: new Date(Date.now() + Math.min(timeoutSeconds * 1000, context.getRemainingTimeInMillis())),
                failure: readFailure(envelope.failure),
            });

            const output = { ...envelope, input: input.parse(result) };
            assertPayload(output);

            return output;
        } catch (error) {
            if (error instanceof RetryableStageError || error instanceof PermanentStageError) {
                // Preserve the error class name for ASL Retry, and the safe domain failure for Catch.
                const wrapped = new Error(JSON.stringify(stageFailure(error)), { cause: error });
                wrapped.name = error.name;
                throw wrapped;
            }
            throw error;
        }
    };
}
