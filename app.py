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
    return FileResponse(os.path.join(frontend_dir, "index.html"))

@app.get("/style.css")
async def get_style():
    return FileResponse(os.path.join(frontend_dir, "style.css"))

@app.get("/app.js")
async def get_js():
    return FileResponse(os.path.join(frontend_dir, "app.js"))

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    if file.filename in indexed_files:
        return {"success": True, "message": "Already indexed"}

    # Create a temporary file to save the uploaded PDF
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name

    try:
        success = search_engine.index_pdf(tmp_file_path, file.filename)
        if success:
            indexed_files.append(file.filename)
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
