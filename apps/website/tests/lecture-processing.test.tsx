import type { LectureProcessing } from "../src/api/lectures/processing";
import { PROCESSING_POLL_MS, processingRefetchInterval } from "../src/api/lectures/use-lecture";
import { SavedMessage } from "../src/components/lectures/lecture-upload-form";
import ProcessingNotice from "../src/components/lectures/processing-notice";
import assert from "node:assert/strict";
import test from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const stageNames = ["verification", "normalization", "transcription", "translation", "summary", "key_terms"] as const;

function processing(overrides: Partial<LectureProcessing> = {}, stages: Partial<Record<(typeof stageNames)[number], string>> = {}) {
    return {
        status: "processing",
        statusMessage: "",
        run: { id: "lecture-1-run-1", number: 1, status: "running" },
        chunks: { total: 4, collected: 2 },
        stages: stageNames.map((stage) => ({
            stage,
            status: stages[stage] ?? "succeeded",
            statusMessage: "",
            attempts: 1,
            updatedAt: null,
        })),
        ...overrides,
    } as LectureProcessing;
}

function ignore() {}

function notice(props: Partial<ComponentProps<typeof ProcessingNotice>>) {
    return renderToStaticMarkup(
        <ProcessingNotice
            processing={undefined}
            fallbackStatus="ready"
            statusError={null}
            refreshingStatus={false}
            role="teacher"
            retrying={false}
            retryError={null}
            onRetry={ignore}
            onRefreshStatus={ignore}
            {...props}
        />,
    );
}

test("status polls only while the server is still working", () => {
    assert.equal(processingRefetchInterval(processing()), PROCESSING_POLL_MS);
    assert.equal(
        processingRefetchInterval(processing({ status: "failed", run: { id: "r", number: 2, status: "running" } })),
        PROCESSING_POLL_MS,
    );
    assert.equal(processingRefetchInterval(processing({ status: "ready", run: { id: "r", number: 1, status: "succeeded" } })), false);
    assert.equal(processingRefetchInterval(processing({ status: "uploaded", run: null })), false);
    assert.equal(processingRefetchInterval(undefined), false);
});

test("a failed run keeps saved content, shows the server message and offers only teachers a retry", () => {
    const failed = processing({
        status: "failed",
        statusMessage: "Summary generation failed.",
        run: { id: "r", number: 1, status: "failed" },
    });
    const teacher = notice({ processing: failed });
    const member = notice({ processing: failed, role: "member" });

    assert.match(teacher, /Summary generation failed\./);
    assert.match(teacher, /Anything already saved is still available/);
    assert.match(teacher, /Retry processing/);
    assert.doesNotMatch(member, /<button[^>]*>Retry processing/);
    assert.match(member, /Your instructor can retry processing/);
});

test("a saved recording whose processing did not start offers retry instead of success", () => {
    const markup = renderToStaticMarkup(
        <SavedMessage
            saved={{ lectureId: "1", processing: { id: "r", number: 1, status: "failed", status_message: "Processing could not start." } }}
            retrying={false}
            retryError={null}
            onRetry={ignore}
        />,
    );

    assert.match(markup, /Recording saved, but processing didn&#x27;t start/);
    assert.match(markup, /Retry processing/);
    assert.doesNotMatch(markup, /Processing has started/);
});
