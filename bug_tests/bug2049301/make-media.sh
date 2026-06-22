#!/usr/bin/env bash
# Generate the two test clips the harness needs (direct.mp4 + frag.mp4).
# Requires ffmpeg (brew install ffmpeg). Run once from this directory.
set -euo pipefail
cd "$(dirname "$0")"

# 40 s, 1280x720@60, H.264 High, 2 s GOP (g=120), AAC, with a burned-in timecode
# so each frame is visually distinct.
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i testsrc2=size=1280x720:rate=60:duration=40 \
  -f lavfi -i sine=frequency=440:duration=40 \
  -vf "drawtext=text='%{pts\:hms}':fontsize=48:fontcolor=white:x=20:y=20:box=1:boxcolor=black@0.5" \
  -c:v libx264 -preset veryfast -g 120 -keyint_min 120 -pix_fmt yuv420p \
  -c:a aac -movflags +faststart direct.mp4

# Fragmented copy for the MSE path.
ffmpeg -y -hide_banner -loglevel error -i direct.mp4 \
  -c copy -movflags frag_keyframe+empty_moov+default_base_moof frag.mp4

echo "wrote: $(ls -1 direct.mp4 frag.mp4)"
