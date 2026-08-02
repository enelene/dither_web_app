import numpy as np
from typing import Dict
from app.dithering.base import DitherAlgorithm, DitherRegistry, ParamSpec
from app.dithering.palettes import PALETTES

@DitherRegistry.register
class FloydSteinbergDither(DitherAlgorithm):
    id = "floyd_steinberg"
    name = "Floyd-Steinberg Diffusion"
    description = "Error-diffusion dithering that distributes quantization errors to neighboring pixels."
    parameters = [
        ParamSpec(name="palette", type="select", default="monochrome", options=list(PALETTES.keys()))
    ]

    def process(self, image: np.ndarray, params: Dict) -> np.ndarray:
        palette = PALETTES.get(params.get("palette", "monochrome"), PALETTES["monochrome"])
        img = image.astype(np.float32)
        h, w, _ = img.shape

        for y in range(h):
            for x in range(w):
                old_pixel = img[y, x].copy()
                
                # Find closest palette color
                dists = np.linalg.norm(palette - old_pixel, axis=1)
                new_pixel = palette[np.argmin(dists)]
                img[y, x] = new_pixel

                # Calculate error
                error = old_pixel - new_pixel

                # Distribute error to neighbors
                if x + 1 < w:
                    img[y, x + 1] += error * (7 / 16)
                if y + 1 < h:
                    if x > 0:
                        img[y + 1, x - 1] += error * (3 / 16)
                    img[y + 1, x] += error * (5 / 16)
                    if x + 1 < w:
                        img[y + 1, x + 1] += error * (1 / 16)

        return np.clip(img, 0, 255).astype(np.uint8)