import os
import tempfile
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from search_engine import HybridSearchEngine

app = FastAPI(title="Offline Hybrid Search Engine API")

# Initialize Search Engine
search_engine = HybridSearchEngine()
indexed_files: List[str] = []

# Serve Frontend files
# Mount the frontend directory so we can serve index.html, style.css, app.js
frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")

@app.get("/")
async def root():
    return FileResponse(
        os.path.join(frontend_dir, "index.html"),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@app.get("/style.css")
async def get_style():
    return FileResponse(
        os.path.join(frontend_dir, "style.css"),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@app.get("/app.js")
async def get_js():
    return FileResponse(
        os.path.join(frontend_dir, "app.js"),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(os.path.join(frontend_dir, "index.html")) # Or 204 No Content

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    if filename in indexed_files:
        return {"success": True, "message": "Already indexed"}

    # Create a temporary file to save the uploaded PDF
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name

    try:
        success = search_engine.index_pdf(tmp_file_path, filename)
        if success:
            indexed_files.append(filename)
            return {"success": True, "message": "File indexed successfully"}
        else:
            return {"success": False, "detail": "Empty PDF or no parseable text."}
    except Exception as e:
        return {"success": False, "detail": str(e)}
    finally:
        if os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)

@app.get("/files")
async def get_files():
    return {"files": indexed_files}

@app.post("/clear")
async def clear_database():
    search_engine.clear()
    indexed_files.clear()
    return {"success": True, "message": "Database cleared"}

from pydantic import BaseModel
from train_embedding import train_fine_tuned_model

class SwitchModelRequest(BaseModel):
    model_key: str

@app.get("/model_status")
async def get_model_status():
    return search_engine.get_model_status()

@app.post("/switch_model")
async def switch_model(req: SwitchModelRequest):
    result = search_engine.switch_model(req.model_key)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("detail", "Error switching model"))
    return result

@app.post("/train")
def train_model(epochs: int = 1):
    chunks = search_engine.get_chunk_contents()
    if not chunks:
        raise HTTPException(status_code=400, detail="No indexed document chunks found. Please upload a PDF first.")
    try:
        saved_dir = train_fine_tuned_model(chunks, epochs=epochs)
        # Automatically switch search engine to use the newly fine-tuned model
        search_engine.switch_model("fine_tuned")
        return {
            "success": True, 
            "message": f"Successfully fine-tuned SentenceTransformer model on {len(chunks)} document chunks!",
            "saved_path": saved_dir,
            "active_model_label": search_engine.active_model_label
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fine-tuning failed: {str(e)}")


@app.get("/search")
async def search(query: str, top_k: int = 5, top_k_retrieval: int = 20):
    if not indexed_files:
        return []
    
    results = search_engine.search(
        query=query, 
        top_k=top_k, 
        top_k_retrieval=top_k_retrieval
    )
    return results

