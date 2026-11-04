import { awsProcessingStarter } from "./aws-processing.ts";
import { lambdaStageHandler } from "./core/processing/lambda-stage-handler.ts";
import { lectureHandlers, lectureStateSchema, type LectureDependencies } from "./core/processing/lecture-pipeline.ts";
import { type StageHandler } from "./core/processing/pipeline.ts";
import { PostgresProcessingRepository } from "./core/processing/postgres-processing-repository.ts";
import { ProcessingService } from "./core/processing/processing-service.ts";
import { resourceProjectionHandlers, resourceStateSchema, type ResourceState } from "./core/processing/resource-pipeline.ts";
import { getDatabase } from "./db/client.ts";
import { lectureRuntime, resourceRuntime } from "./stage-runtime.ts";

export function lectureStageHandlers(dependencies: LectureDependencies) {
    return Object.fromEntries(
        Object.entries(lectureHandlers(dependencies)).map(([name, handler]) => [name, lambdaStageHandler(handler, lectureStateSchema)]),
    );
}
export function resourceStageHandlers(processing: Parameters<typeof resourceProjectionHandlers>[0], extract: StageHandler<ResourceState>) {
    return Object.fromEntries(
        Object.entries(resourceProjectionHandlers(processing, extract)).map(([name, handler]) => [
            name,
            lambdaStageHandler(handler, resourceStateSchema),
        ]),
    );
}

let lecture: ReturnType<typeof lectureStageHandlers> | undefined;
let resource: ReturnType<typeof resourceStageHandlers> | undefined;
type Handler = ReturnType<typeof lectureStageHandlers>[string];
function lectureTask(name: string): Handler {
    return async (event, context) => {
        lecture ??= Object.fromEntries(
            Object.entries(lectureRuntime()).map(([key, handler]) => [key, lambdaStageHandler(handler, lectureStateSchema)]),
        );

        return lecture[name]!(event, context);
    };
}
function resourceTask(name: string): ReturnType<typeof resourceStageHandlers>[string] {
    return async (event, context) => {
        resource ??= Object.fromEntries(
            Object.entries(resourceRuntime()).map(([key, handler]) => [key, lambdaStageHandler(handler, resourceStateSchema)]),
        );

        return resource[name]!(event, context);
    };
}
export const lectureVerifyRecording = lectureTask("VerifyRecording");
export const lectureNormalizeRecording = lectureTask("NormalizeRecording");
export const lectureSubmitChunk = lectureTask("SubmitChunk");
export const lectureCheckChunk = lectureTask("CheckChunk");
export const lectureCollectChunk = lectureTask("CollectChunk");
export const lectureStitchTranscript = lectureTask("StitchTranscript");
export const lectureGenerateSummary = lectureTask("GenerateSummary");
export const lectureGenerateKeyTerms = lectureTask("GenerateKeyTerms");
export const lectureSummaryFailure = lectureTask("SummaryFailure");
export const lectureKeyTermsFailure = lectureTask("KeyTermsFailure");
export const lecturePublishLecture = lectureTask("PublishLecture");
export const lectureRecordFailure = lectureTask("RecordFailure");
export const resourceExtractResource = resourceTask("ExtractResource");
export const resourceCompleteResource = resourceTask("CompleteResource");
export const resourceRecordFailure = resourceTask("RecordFailure");

export async function reconcileProcessing() {
    const db = getDatabase();
    const repository = new PostgresProcessingRepository(db);
    await repository.expireRuns();
    await new ProcessingService(
        repository,
        awsProcessingStarter({
            lecture: process.env.PROCESSING_LECTURE_MACHINE_ARN,
            resource: process.env.PROCESSING_RESOURCE_MACHINE_ARN,
        }),
    ).recoverStarts();
}
