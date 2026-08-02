from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.routes import router as api_router

app = FastAPI(title="Dither Studio API", version="1.0.0")

app.include_router(api_router, prefix="/api/v1")

# Serve Frontend Static Assets
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")