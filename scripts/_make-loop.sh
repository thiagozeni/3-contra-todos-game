#!/usr/bin/env bash
# Loop seamless por CROSSFADE (não ping-pong) + re-pixelização LEVE.
# Pipeline da Fatia V (ver memória reference_intro_video_pipeline).
#
# Uso: _make-loop.sh <in.mp4> <out.mp4> [DUR] [XF] [PIX]
#   DUR = duração do clip de entrada (s)        [default 5]
#   XF  = overlap do crossfade (s)              [default 1]
#   PIX = fator de re-pixelização (0=off)       [default 0.66]
#
# Saída: loop de (DUR-XF)s, mudo, yuv420p. O começo é o crossfade entre o último
# trecho e o primeiro do clip → emenda invisível ao reiniciar.
set -euo pipefail
IN="$1"; OUT="$2"; DUR="${3:-5}"; XF="${4:-1}"; PIX="${5:-0.66}"
MAIN_END=$(echo "$DUR - $XF" | bc -l)

# Filtro de re-pixelização leve (downscale + upscale nearest) — encadeado no fim.
PIXF=""
if [ "$PIX" != "0" ]; then
  PIXF=",scale=iw*${PIX}:ih*${PIX}:flags=bilinear,scale=iw/${PIX}:ih/${PIX}:flags=neighbor"
fi

ffmpeg -y -loglevel error -i "$IN" -filter_complex "\
[0:v]trim=${MAIN_END}:${DUR},setpts=PTS-STARTPTS[tail];\
[0:v]trim=0:${XF},setpts=PTS-STARTPTS[head];\
[tail][head]xfade=transition=fade:duration=${XF}:offset=0[begin];\
[0:v]trim=${XF}:${MAIN_END},setpts=PTS-STARTPTS[main];\
[begin][main]concat=n=2:v=1${PIXF},format=yuv420p[out]" \
-map "[out]" -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUT"

echo "loop -> $OUT ($(echo "$DUR - $XF" | bc -l)s)"
