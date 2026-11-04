import { DockerImage } from "aws-cdk-lib";
import { Architecture, Code, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";

export class RecordingMediaLayer extends LayerVersion {
    constructor(scope: Construct, id: string) {
        const directory = fileURLToPath(new URL("../../../api/media-layer", import.meta.url));
        super(scope, id, {
            code: Code.fromAsset(directory, {
                bundling: {
                    image: DockerImage.fromBuild(directory, { platform: "linux/arm64", targetStage: "verify" }),
                    platform: "linux/arm64",
                    entrypoint: ["/bin/sh"],
                    command: ["-c", "cp -a /opt/bin /opt/lib /opt/share /asset-output/"],
                },
            }),
            compatibleArchitectures: [Architecture.ARM_64],
            compatibleRuntimes: [Runtime.NODEJS_24_X],
            description: "ffmpeg/ffprobe 7.1.3, LGPL build, verified on Lambda Node 24 arm64",
        });
    }
}
