# OPUS promo — version 2 ("Just say it.")

Vertical 1080x1920, 50 s, Fish Audio voice-over ("Young Enthusiast", free model), generated
music and sound effects, HyperFrames composition. Style follows Rudy's two reference videos:
a 3D mascot and props in a pixel-dot (dithered) look, flat colour scenes, big left-aligned
type with highlight boxes, thick-outline cards with hard shadows, spinning coins, running timecode.

Everything visual is made in code (free): the mascot and props are ray-marched 3D renders,
then dithered.

## Rebuild (from this folder)

```
python3 -I tools/render_mascot.py wave assets/src/m-wave.png 1000   # poses: wave cheer hold point think
python3 -I tools/dither.py assets/src/m-wave.png assets/mascot/wave.png --cell 6 --spread 80 --palette ink,paper,cobalt,skyl
python3 -I tools/render_ring.py assets/src/ring30.png 600 30
python3 -I tools/dither.py assets/src/ring30.png assets/objects/ring.png --cell 6 --spread 80
python3 -I tools/render_ring.py assets/src/ring-big.png 960 35
python3 -I tools/dither.py assets/src/ring-big.png assets/objects/ring-big.png --cell 8 --spread 80 --palette ink,paper,skyl,cobaltdark
python3 -I tools/render_croissant.py assets/src/croissant.png 600
python3 -I tools/dither.py assets/src/croissant.png assets/objects/croissant.png --cell 6 --spread 80 --palette ink,paper,yellow,orange
python3 -I tools/make_audio.py                                       # needs assets/voice/vo1..vo8.wav
ffmpeg -y -i assets/audio/mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 44100 assets/audio/mix-loud.wav && mv assets/audio/mix-loud.wav assets/audio/mix.wav
export PRODUCER_HEADLESS_SHELL_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
npx hyperframes@0.8.183 check .
npx hyperframes@0.8.183 render . -q high -o renders/opus-promo-v2.mp4
```

Voice lines (Fish Audio `POST /v1/tts`, header `model: s2.1-pro-free`, voice
`d0da4f95891148c4b08f8c7e6eaeb427`) are saved in `assets/voice/`; timings are in
`tools/make_audio.py` and must match the `data-t` times in `index.html`.
