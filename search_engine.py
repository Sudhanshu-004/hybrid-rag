import re
from typing import TypedDict, Optional, Any
import numpy as np
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from rank_bm25 import BM25Okapi

class RRFItem(TypedDict):
    doc: Document
    rrf_score: float
    faiss_rank: Optional[int]
    faiss_score: Optional[float]
    bm25_rank: Optional[int]
    bm25_score: Optional[float]

def tokenize(text: str) -> list[str]:
    """Basic alphanumeric tokenization for BM25 matching."""
    return re.findall(r'\w+', text.lower())

class HybridSearchEngine:
    def __init__(self):
        # Initialize embeddings using the local HuggingFace sentence transformer
        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
        self.vector_store = None
        self.bm25 = None
        self.chunks = []
        
    def index_pdf(self, pdf_path: str, pdf_name: str) -> bool:
        """
        Parses a PDF file page-by-page, chunks the text, and constructs both
        dense (FAISS) and sparse (BM25) search indices.
        """
        # 1. Text Extraction
        reader = PdfReader(pdf_path)
        documents = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                documents.append(Document(
                    page_content=text,
                    metadata={"source": pdf_name, "page": i}
                ))
        
        if not documents:
            return False
            
        # 2. Text Chunking
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        new_chunks = splitter.split_documents(documents)
        
        # Explicitly append the original PDF page number (doc.metadata["page"] + 1) to each chunk's metadata
        for chunk in new_chunks:
            chunk.metadata["page"] = chunk.metadata["page"] + 1
            
        # Add a unique chunk index to handle rank mapping during fusion
        start_idx = len(self.chunks)
        for idx, chunk in enumerate(new_chunks):
            chunk.metadata["chunk_id"] = start_idx + idx
            
        self.chunks.extend(new_chunks)
        
        # 3. Dense Semantic Index (FAISS)
        self.vector_store = FAISS.from_documents(self.chunks, self.embeddings)
        
        # 4. Sparse Keyword Index (BM25)
        tokenized_corpus = [tokenize(c.page_content) for c in self.chunks]
        self.bm25 = BM25Okapi(tokenized_corpus)
        return True
        
    def clear(self):
        """Clears all indexed chunks and active indices."""
        self.chunks = []
        self.vector_store = None
        self.bm25 = None

    def search(self, query: str, top_k: int = 5, top_k_retrieval: int = 20) -> list[dict[str, Any]]:
        """
        Retrieves matching chunks from both FAISS (Dense) and BM25 (Sparse) indices,
        merges their rankings using Reciprocal Rank Fusion (RRF), and returns
        the top_k highest accuracy results.
        """
        if not self.chunks or not self.vector_store or not self.bm25:
            return []
            
        # 1. Dense Search (FAISS)
        faiss_results = self.vector_store.similarity_search_with_score(query, k=top_k_retrieval)
        
        # 2. Sparse Search (BM25)
        tokenized_query = tokenize(query)
        bm25_scores = self.bm25.get_scores(tokenized_query)
        top_bm25_indices = np.argsort(bm25_scores)[::-1][:top_k_retrieval]
        bm25_results = [(self.chunks[idx], bm25_scores[idx]) for idx in top_bm25_indices if bm25_scores[idx] > 0]
        
        # 3. Reciprocal Rank Fusion (RRF)
        K_RRF = 60
        rrf_scores: dict[int, RRFItem] = {}
        
        # Process FAISS Ranks
        for rank, (doc, score) in enumerate(faiss_results, start=1):
            doc_obj: Document = doc
            chunk_id = int(doc_obj.metadata["chunk_id"])
            if chunk_id not in rrf_scores:
                rrf_scores[chunk_id] = {
                    "doc": doc_obj,
                    "rrf_score": 0.0,
                    "faiss_rank": rank,
                    "faiss_score": float(score),
                    "bm25_rank": None,
                    "bm25_score": None
                }
            else:
                rrf_scores[chunk_id]["faiss_rank"] = rank
                rrf_scores[chunk_id]["faiss_score"] = float(score)
                
        # Process BM25 Ranks
        for rank, (doc, score) in enumerate(bm25_results, start=1):
            doc_obj: Document = doc
            chunk_id = int(doc_obj.metadata["chunk_id"])
            if chunk_id not in rrf_scores:
                rrf_scores[chunk_id] = {
                    "doc": doc_obj,
                    "rrf_score": 0.0,
                    "faiss_rank": None,
                    "faiss_score": None,
                    "bm25_rank": rank,
                    "bm25_score": float(score)
                }
            else:
                rrf_scores[chunk_id]["bm25_rank"] = rank
                rrf_scores[chunk_id]["bm25_score"] = float(score)
                
        # Calculate final combined RRF score
        for chunk_id, info in rrf_scores.items():
            score_val = 0.0
            if info["faiss_rank"] is not None:
                score_val += 1.0 / (K_RRF + info["faiss_rank"])
            if info["bm25_rank"] is not None:
                score_val += 1.0 / (K_RRF + info["bm25_rank"])
            info["rrf_score"] = score_val
            
        # Sort results by RRF score descending
        sorted_rrf = sorted(rrf_scores.values(), key=lambda x: x["rrf_score"], reverse=True)
        
        # Format output
        results = []
        for item in sorted_rrf[:top_k]:
            doc_obj = item["doc"]
            results.append({
                "content": doc_obj.page_content,
                "metadata": {
                    "source": str(doc_obj.metadata.get("source", "Unknown")),
                    "page": int(doc_obj.metadata.get("page", 0)),
                    "chunk_id": int(doc_obj.metadata.get("chunk_id", -1))
                },
                "rrf_score": round(item["rrf_score"], 6),
                "faiss_rank": item["faiss_rank"],
                "faiss_score": round(item["faiss_score"], 4) if item["faiss_score"] is not None else None,
                "bm25_rank": item["bm25_rank"],
                "bm25_score": round(item["bm25_score"], 4) if item["bm25_score"] is not None else None
            })
            
        return results
