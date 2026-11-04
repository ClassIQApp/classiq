import { ContentIndexService } from "./core/content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "./core/content-index/postgres-content-index-repository.ts";
import { ResourceContentIndexer } from "./core/content-index/resource-content-indexer.ts";
import { readCourseResourceFileConfig } from "./core/course-resource/file/config.ts";
import { lectureHandlers } from "./core/processing/lecture-pipeline.ts";
import { PostgresProcessingRepository } from "./core/processing/postgres-processing-repository.ts";
import { extractResourceStage, resourceProjectionHandlers } from "./core/processing/resource-pipeline.ts";
import { PostgresUploadRepository } from "./core/uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "./core/uploads/s3-upload-storage.ts";
import { getDatabase } from "./db/client.ts";
import { liveLectureDependencies } from "./lecture-dependencies.ts";
import { S3Client } from "@aws-sdk/client-s3";

function persistence() {
    const db = getDatabase();
    const processing = new PostgresProcessingRepository(db);
    const uploads = new PostgresUploadRepository(db);
    const config = readCourseResourceFileConfig(process.env);
    const storage = new S3UploadStorage(
        config,
        new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: !!config.endpoint }),
    );

    return { db, processing, uploads, storage };
}
export function resourceRuntime() {
    const { db, processing, uploads, storage } = persistence();

    return resourceProjectionHandlers(processing, async (input, context) => {
        const index = new PostgresContentIndexRepository(db, (client) =>
            processing.guard(client, { kind: "resource", ...input }, context.runId),
        );

        return extractResourceStage(uploads, storage, index, new ResourceContentIndexer(new ContentIndexService(index)))(input, context);
    });
}
export function lectureRuntime() {
    const db = getDatabase();
    const config = readCourseResourceFileConfig(process.env);

    return lectureHandlers(
        liveLectureDependencies(db, new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: !!config.endpoint })),
    );
}
