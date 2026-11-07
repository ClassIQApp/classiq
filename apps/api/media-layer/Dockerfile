FROM public.ecr.aws/sam/build-nodejs24.x:latest-arm64@sha256:e7f36af40dcdf65be63869abe5123307c14f46bf660369f677d295ff6d2ce184 AS build
RUN dnf install -y gcc gcc-c++ make nasm openssl-devel zlib-devel tar xz
WORKDIR /build
ARG FFMPEG_VERSION=7.1.3
RUN curl -fsSL --retry 5 --retry-all-errors --connect-timeout 30 --max-time 180 https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz -o ffmpeg.tar.xz \
    && echo 'f0bf043299db9e3caacb435a712fc541fbb07df613c4b893e8b77e67baf3adbe  ffmpeg.tar.xz' | sha256sum -c - \
    && tar xJf ffmpeg.tar.xz \
    && cd ffmpeg-${FFMPEG_VERSION} \
    && ./configure --prefix=/opt --disable-doc --disable-debug --disable-ffplay --disable-autodetect --enable-openssl --enable-zlib \
    && make -j2 && make install \
    && mkdir -p /layer/bin /layer/lib /layer/share/ffmpeg \
    && cp /opt/bin/ffmpeg /opt/bin/ffprobe /layer/bin/ \
    && cp COPYING.LGPLv2.1 LICENSE.md /layer/share/ffmpeg/
COPY collect-libraries.sh /build/collect-libraries.sh
RUN bash /build/collect-libraries.sh
FROM public.ecr.aws/lambda/nodejs:24@sha256:92b7cccd985332238af80ac8da42d6965d418552e88955e315da4e3c0c76ca79 AS verify
COPY --from=build /layer/ /opt/
RUN /opt/bin/ffmpeg -v error -f lavfi -i sine=frequency=440:duration=2 -c:a aac /tmp/input.m4a \
    && /opt/bin/ffmpeg -v error -i /tmp/input.m4a -ac 1 -ar 16000 -af silencedetect=noise=-35dB:d=0.6 -c:a flac /tmp/output.flac \
    && /opt/bin/ffprobe -v error -show_streams /tmp/output.flac | grep 'sample_rate=16000' \
    && /opt/bin/ffmpeg -protocols 2>/dev/null | grep https \
    && rm /tmp/input.m4a /tmp/output.flac
FROM scratch AS artifact
COPY --from=verify /opt/ /asset/
