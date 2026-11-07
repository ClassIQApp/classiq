# Lambda audio tools

Adapted from ourlil's native media-layer packaging. Only ffmpeg/ffprobe are included; ClassIQ does not use sharp, libvips or HEIC libraries.

The Dockerfile pins the AWS Node 24 arm64 build/runtime image digests and ffmpeg 7.1.3 source checksum. It builds without GPL/nonfree options, includes LGPLv2.1 and upstream license notices, and collects runtime libraries outside Lambda's glibc. The clean runtime stage decodes AAC, detects silence, encodes mono 16 kHz FLAC, probes the output and checks HTTPS protocol availability. OpenSSL supplies HTTPS for private signed S3 inputs. This does not replace deployment/runtime performance or representative format testing.

```sh
docker build --platform linux/arm64 --target verify -t classiq-recording-media:verify apps/api/media-layer
PROCESSING_TEST_MEDIA_LAYER=1 pnpm --filter @classiq/infra test
```

CDK builds the verification stage and copies `/opt/bin`, `/opt/lib` and license notices into the layer asset. Only NormalizeRecording attaches the layer. No credentials are passed to the Docker build. The first compile is slow; Docker caches subsequent builds. GitHub Actions enables arm64 emulation on its Linux runner.

ffmpeg source is available at https://ffmpeg.org/releases/ffmpeg-7.1.3.tar.xz. Build flags and patches (none) are in this Dockerfile; preserve notices/source availability when distributing the layer. Runtime dependencies are pinned by the base image and source version, but OS package updates can change the library closure on a fresh build.
