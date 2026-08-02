import numpy as np

PALETTES = {
    "monochrome": np.array([
        [0, 0, 0],
        [255, 255, 255]
    ], dtype=np.uint8),

    "gameboy": np.array([
        [15, 56, 15],
        [48, 98, 48],
        [139, 172, 15],
        [155, 188, 15]
    ], dtype=np.uint8),

    "cga_cyberpunk": np.array([
        [0, 0, 0],
        [85, 255, 255],
        [255, 85, 255],
        [255, 255, 255]
    ], dtype=np.uint8),

    "epaper_6color": np.array([
        [0, 0, 0],         # Black
        [255, 255, 255],   # White
        [255, 0, 0],       # Red
        [0, 255, 0],       # Green
        [0, 0, 255],       # Blue
        [255, 255, 0]      # Yellow
    ], dtype=np.uint8)
}