#!/usr/bin/env bash
set -euo pipefail
find /layer/bin -type f -exec ldd {} + |
    awk '/=> \// {print $3}' | sort -u |
    while read -r library; do
        case "$(basename "$library")" in
            libc.so.*|libm.so.*|libdl.so.*|libpthread.so.*|librt.so.*|ld-linux-*) continue ;;
        esac
        cp -L "$library" /layer/lib/
    done
find /layer -type f \( -name '*.so*' -o -name ffmpeg -o -name ffprobe \) -exec strip --strip-unneeded {} +
size=$(du -sb /layer | cut -f1)
echo "Audio layer: $size bytes"
# Reserve 30 MiB for the function ZIP's uncompressed contents.
test "$size" -lt 230686720
