import type { PipelineDefinition, PipelineState } from "./pipeline.ts";

type AslValue = string | number | boolean | readonly AslValue[] | { readonly [key: string]: AslValue };
export interface AslDefinition {
    readonly StartAt: string;
    readonly States: Record<string, { readonly [key: string]: AslValue }>;
    readonly TimeoutSeconds?: number;
}

function inputPath(field: string): string {
    return `$.input['${field.replaceAll("\\", "\\\\").replaceAll("'", String.raw`\'`)}']`;
}

function compileState(name: string, state: PipelineState, catchTarget?: string, prefix = ""): { readonly [key: string]: AslValue } {
    switch (state.type) {
        case "task": {
            const retry = state.retry;
            const catches = Object.entries(state.catches ?? {})
                .filter(([error]) => error !== "States.ALL")
                .map(([error, next]) => ({
                    ErrorEquals: [error],
                    ResultPath: "$.failure",
                    Next: next,
                }));
            const fallback = state.catches?.["States.ALL"] ?? (name === catchTarget ? undefined : catchTarget);
            if (fallback) {
                catches.push({ ErrorEquals: ["States.ALL"], ResultPath: "$.failure", Next: fallback });
            }

            return {
                Type: "Task" as const,
                Resource: "arn:aws:states:::lambda:invoke",
                Parameters: {
                    FunctionName: `\${${name}FunctionArn}`,
                    Payload: { "envelope.$": "$", "retryCount.$": "$$.State.RetryCount", timeoutSeconds: state.timeoutSeconds },
                },
                OutputPath: "$.Payload",
                TimeoutSeconds: state.timeoutSeconds,
                Next: state.next,
                ...(retry
                    ? {
                          Retry: [
                              {
                                  ErrorEquals: retry.errors,
                                  IntervalSeconds: retry.intervalSeconds,
                                  BackoffRate: retry.backoffRate,
                                  MaxAttempts: retry.maxAttempts,
                                  MaxDelaySeconds: retry.maxDelaySeconds,
                                  JitterStrategy: retry.jitter ? "FULL" : "NONE",
                              },
                          ],
                      }
                    : {}),
                ...(catches.length > 0 ? { Catch: catches } : {}),
            };
        }
        case "choice":
            return {
                Type: "Choice" as const,
                Choices: Object.entries(state.cases).map(([value, next]): { readonly [key: string]: AslValue } => ({
                    And: [
                        { Variable: inputPath(state.field), IsPresent: true },
                        { Variable: inputPath(state.field), IsString: true },
                        { Variable: inputPath(state.field), StringEquals: value },
                    ],
                    Next: next,
                })),
                Default: state.default,
            };
        case "map":
        case "parallel":
            return {
                ...(state.type === "map"
                    ? {
                          Type: "Map" as const,
                          ItemsPath: inputPath(state.itemsField),
                          ItemSelector: { "runId.$": "$.runId", "input.$": "$$.Map.Item.Value" },
                          ItemProcessor: { ProcessorConfig: { Mode: "INLINE" }, ...compileDefinition(state.iterator, `${prefix}${name}/`) },
                          MaxConcurrency: state.maxConcurrency,
                      }
                    : {
                          Type: "Parallel" as const,
                          Branches: state.branches.map((branch, index) => ({ ...compileDefinition(branch, `${prefix}${name}/${index}/`) })),
                      }),
                ResultSelector: { "values.$": "$[*].input" },
                ResultPath: inputPath(state.resultField),
                Next: state.next,
                ...(catchTarget ? { Catch: [{ ErrorEquals: ["States.ALL"], ResultPath: "$.failure", Next: catchTarget }] } : {}),
            };
        case "wait":
            return { Type: "Wait" as const, Seconds: state.seconds, Next: state.next };
        case "succeed":
            return { Type: "Succeed" as const };
        case "fail":
            return { Type: "Fail" as const, Error: "ProcessingFailed", Cause: "A processing stage failed." };
    }
}

function compileDefinition(pipeline: PipelineDefinition, prefix: string): AslDefinition {
    const states = Object.fromEntries(
        Object.entries(pipeline.states).map(([name, state]) => {
            const compiled = compileState(name, state, pipeline.catch, prefix);
            // Next/Catch/Choice targets are local to this definition; nested machines are already compiled.
            const qualify = (value: AslValue): AslValue => {
                if (Array.isArray(value)) return value.map((item) => qualify(item));
                if (typeof value !== "object" || value === null) return value;

                return Object.fromEntries(
                    Object.entries(value).map(([key, child]) => [
                        key,
                        (key === "Next" || key === "Default") && typeof child === "string"
                            ? `${prefix}${child}`
                            : ["Branches", "ItemProcessor"].includes(key)
                              ? child
                              : qualify(child),
                    ]),
                );
            };
            const qualified = Object.fromEntries(
                Object.entries(compiled).map(([key, value]) => [
                    key,
                    (key === "Next" || key === "Default") && typeof value === "string"
                        ? `${prefix}${value}`
                        : ["Branches", "ItemProcessor"].includes(key)
                          ? value
                          : qualify(value),
                ]),
            );

            return [`${prefix}${name}`, qualified] as const;
        }),
    );

    return {
        StartAt: `${prefix}${pipeline.startAt}`,
        States: states,
        ...(pipeline.timeoutSeconds ? { TimeoutSeconds: pipeline.timeoutSeconds } : {}),
    };
}

export function generateAsl(pipeline: PipelineDefinition): AslDefinition {
    return compileDefinition(pipeline, "");
}
