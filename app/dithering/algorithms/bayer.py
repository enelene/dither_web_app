from typing import Dict

import numpy as np
from app.dithering.base import DitherAlgorithm, DitherRegistry, ParamSpec
from app.dithering.palettes import PALETTES

BAYER_MATRICES = {
    2: np.array([[0, 2], [3, 1]]) / 4.0,
    4: np.array([
        [ 0,  8,  2, 10],
        [12,  4, 14,  6],
        [ 3, 11,  1,  9],
        [15,  7, 13,  5]
    ]) / 16.0,
    8: np.array([
        [ 0, 32,  8, 40,  2, 34, 10, 42],
        [48, 16, 56, 24, 50, 18, 58, 26],
        [12, 44,  4, 36, 14, 46,  6, 38],
        [60, 28, 52, 20, 62, 30, 54, 22],
        [ 3, 35, 11, 43,  1, 33,  9, 41],
        [51, 19, 59, 27, 49, 17, 57, 25],
        [15, 47,  7, 39, 13, 45,  5, 37],
        [63, 31, 55, 23, 61, 29, 53, 21]
    ]) / 64.0
}

@DitherRegistry.register
class BayerDither(DitherAlgorithm):
    id = "bayer"
    name = "Bayer Matrix Dithering"
    description = "Deterministic ordered dithering using spatial threshold matrices."
    parameters = [
        ParamSpec(name="matrix_size", type="select", default=4, options=[2, 4, 8]),
        ParamSpec(name="palette", type="select", default="monochrome", options=list(PALETTES.keys())),
        ParamSpec(name="spread", type="range", default=64, min_val=10, max_val=128, step=1)
    ]

    def process(self, image: np.ndarray, params: Dict) -> np.ndarray:
        size = int(params.get("matrix_size", 4))
        spread = float(params.get("spread", 64))
        palette = PALETTES.get(params.get("palette", "monochrome"), PALETTES["monochrome"])

        h, w, _ = image.shape
        bayer = BAYER_MATRICES[size]
        bayer_tiled = np.tile(bayer, (int(np.ceil(h / size)), int(np.ceil(w / size))))[:h, :w]
        threshold_map = (bayer_tiled - 0.5) * spread

        # Apply threshold offset
        noisy_img = np.clip(image.astype(np.float32) + threshold_map[:, :, None], 0, 255)

        # Quantize to nearest palette color
        pixels = noisy_img.reshape(-1, 3)
        distances = np.linalg.norm(pixels[:, None, :] - palette[None, :, :], axis=2)
        closest_indices = np.argmin(distances, axis=1)
        
        return palette[closest_indices].reshape(h, w, 3).astype(np.uint8)