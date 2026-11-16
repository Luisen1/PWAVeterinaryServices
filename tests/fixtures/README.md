# Medios sintéticos de prueba

`note.webm`, `note.ogg` y `note.m4a` contienen un segundo de tono sintético de 440 Hz, sin voz ni datos personales. Se usan para verificar análisis de contenedores, duración y reproducción. Generados con FFmpeg: entrada `sine=frequency=440:duration=1`, audio Opus 32 kbps en WebM/Ogg y AAC 32 kbps en MP4.

No representan grabaciones de un dispositivo. La captura real de MediaRecorder se comprueba por separado en navegador; Safari/iPhone físicos requieren aceptación manual.
