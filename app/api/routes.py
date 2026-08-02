from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
import json
import cv2
import numpy as np

from app.dithering.base import DitherRegistry
# Import algorithms to ensure registration
import app.dithering.algorithms.bayer
import app.dithering.algorithms.floyd_steinberg

router = APIRouter()

@router.get("/algorithms")
async def get_algorithms():
    """Returns all available algorithms and their UI parameter schemas."""
    return DitherRegistry.list_all()

@router.post("/dither")
async def apply_dither(
    file: UploadFile = File(...),
    algorithm: str = Form("bayer"),
    params: str = Form("{}")
):
    algo_instance = DitherRegistry.get(algorithm)
    if not algo_instance:
        raise HTTPException(status_code=400, detail=f"Algorithm '{algorithm}' not found.")

    param_dict = json.loads(params)
    
    # Read image file bytes
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # Process image
    output_rgb = algo_instance.process(img_rgb, param_dict)
    
    # Encode back to PNG
    output_bgr = cv2.cvtColor(output_rgb, cv2.COLOR_RGB2BGR)
    _, encoded_img = cv2.imencode(".png", output_bgr)
    
    return Response(content=encoded_img.tobytes(), media_type="image/png")