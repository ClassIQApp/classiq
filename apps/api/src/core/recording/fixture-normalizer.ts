import type { UploadAsset } from "../uploads/model.ts";
import type { NormalizedRecording, RecordingNormalizer } from "./model.ts";

export class FixtureRecordingNormalizer implements RecordingNormalizer {
    readonly calls = new Map<string, number>();
    private readonly fixture: NormalizedRecording;
    constructor(fixture: NormalizedRecording) {
        this.fixture = fixture;
    }
    async normalize(asset: UploadAsset) {
        this.calls.set(asset.id, (this.calls.get(asset.id) ?? 0) + 1);

        return structuredClone(this.fixture);
    }
}
