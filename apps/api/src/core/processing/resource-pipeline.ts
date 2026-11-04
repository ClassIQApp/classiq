import type { ContentIndexRepository } from "../content-index/content-index-repository.ts";
import type { ResourceContentIndexer } from "../content-index/resource-content-indexer.ts";
import type { UploadRepository, UploadStorage } from "../uploads/model.ts";
import { definePipeline, PermanentStageError, transient, type StageHandler } from "./pipeline.ts";
import type { PostgresProcessingRepository } from "./postgres-processing-repository.ts";
import { z } from "zod";

export const resourceStateSchema = z.object({ courseId: z.string().min(1), resourceId: z.string().min(1) });
export type ResourceState = z.infer<typeof resourceStateSchema>;

export const resourcePipeline = definePipeline({
    name: "resource",
    startAt: "ExtractResource",
    timeoutSeconds: 600,
    catch: "RecordFailure",
    states: {
        ExtractResource: {
            type: "task",
            timeoutSeconds: 120,
            retry: transient,
            catches: { SupersededRunError: "Done" },
            next: "CompleteResource",
        },
        CompleteResource: { type: "task", timeoutSeconds: 30, retry: transient, catches: { SupersededRunError: "Done" }, next: "Done" },
        RecordFailure: { type: "task", timeoutSeconds: 30, retry: transient, next: "Failed" },
        Failed: { type: "fail" },
        Done: { type: "succeed" },
    },
});

export function extractResourceStage(
    uploads: Pick<UploadRepository, "find">,
    storage: Pick<UploadStorage, "read">,
    content: Pick<ContentIndexRepository, "findSource">,
    indexer: Pick<ResourceContentIndexer, "index">,
): StageHandler<ResourceState> {
    return async (input, context) => {
        const asset = await uploads.find(input.courseId, "resource", input.resourceId);
        if (!asset || asset.uploadStatus !== "uploaded") {
            throw new PermanentStageError("RESOURCE_NOT_UPLOADED", "Upload the resource before processing it.");
        }
        const existing = await content.findSource({ kind: "resource", ...input });
        if (existing?.status === "indexed") {
            return input;
        }
        if (context.deadline.getTime() <= Date.now()) {
            throw new PermanentStageError("PROCESSING_TIMEOUT", "Resource processing timed out. Try again.");
        }
        const source = await indexer.index(input, () => storage.read(asset));
        if (source.status !== "indexed") {
            throw new PermanentStageError("RESOURCE_EXTRACTION_FAILED", source.statusMessage);
        }

        return input;
    };
}

export function resourceProjectionHandlers(
    processing: Pick<PostgresProcessingRepository, "stage" | "succeed" | "fail">,
    extract: StageHandler<ResourceState>,
) {
    const subject = (input: ResourceState) => ({ kind: "resource", ...input }) as const;

    return {
        ExtractResource: async (input: ResourceState, context) => {
            const started = await processing.stage(subject(input), context.runId, "extraction", "running", context.attempt);
            if (!started) return input;
            const result = await extract(input, context);
            await processing.stage(subject(input), context.runId, "extraction", "succeeded", context.attempt);

            return result;
        },
        CompleteResource: async (input: ResourceState, context) => {
            await processing.succeed(subject(input), context.runId);

            return input;
        },
        RecordFailure: async (input: ResourceState, context) => {
            await processing.fail(
                subject(input),
                context.runId,
                context.failure?.code ?? "PROCESSING_FAILED",
                context.failure?.message ?? "Processing failed. Try again.",
            );

            return input;
        },
    } satisfies Record<string, StageHandler<ResourceState>>;
}
