import os
import re
from typing import List, Any
from sentence_transformers import SentenceTransformer, InputExample
from sentence_transformers.losses import MultipleNegativesRankingLoss  # type: ignore
from torch.utils.data import DataLoader

BASE_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "fine_tuned_embedder")

def extract_training_examples(chunks: List[str]) -> List[InputExample]:
    """
    Extracts synthetic query-passage training pairs from indexed PDF text chunks.
    Uses sentences or key phrases as queries paired with chunk passages.
    """
    examples: List[InputExample] = []
    for chunk in chunks:
        clean_text = chunk.strip()
        if not clean_text or len(clean_text) < 30:
            continue
        
        # Split text into sentences
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', clean_text) if len(s.strip()) > 15]
        
        for sentence in sentences[:3]:
            examples.append(InputExample(texts=[sentence, clean_text]))
            
    return examples



def train_fine_tuned_model(chunks: List[str], epochs: int = 1, batch_size: int = 16) -> str:
    """
    Fine-tunes the base SentenceTransformer model on the provided text chunks
    and saves the weights locally to OUTPUT_DIR.
    """
    examples = extract_training_examples(chunks)
    
    # Cap training pairs to top 30 to ensure ultra-fast web feedback (5-8 seconds)
    if len(examples) > 30:
        examples = examples[:30]
        
    # Fallback to general AI/RAG examples if minimal chunks are provided
    if len(examples) < 2:
        examples.extend([
            InputExample(texts=["What is RAG?", "Retrieval Augmented Generation combines document search with generative AI."]),
            InputExample(texts=["How does FAISS work?", "FAISS creates dense vector similarity indices for fast vector retrieval."]),
            InputExample(texts=["What is BM25?", "BM25 is a sparse keyword search ranking algorithm based on term frequency."]),
            InputExample(texts=["What is hybrid search?", "Hybrid search joins FAISS dense search with BM25 sparse search using Reciprocal Rank Fusion."])
        ])
        
    print(f"Loaded {len(examples)} training pairs for fine-tuning.")
    
    model = SentenceTransformer(BASE_MODEL_NAME)
    
    # Pass dataset sequence for DataLoader compatibility
    dataset_input: Any = examples
    dataloader = DataLoader(dataset_input, shuffle=True, batch_size=min(batch_size, len(examples)))

    
    # Loss function
    train_loss = MultipleNegativesRankingLoss(model)
    
    # Fine-tune the model
    model.fit(
        train_objectives=[(dataloader, train_loss)],
        epochs=epochs,
        warmup_steps=max(1, int(len(dataloader) * epochs * 0.1)),
        show_progress_bar=False
    )
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    model.save(OUTPUT_DIR)
    print(f"Fine-tuned model successfully saved to {OUTPUT_DIR}")
    return OUTPUT_DIR

if __name__ == "__main__":
    sample_chunks = [
        "Hybrid search combines dense vector retrieval using FAISS with sparse lexical matching using BM25Okapi.",
        "Reciprocal Rank Fusion merges two candidate lists into a single unified relevance score without manual score normalization."
    ]
    train_fine_tuned_model(sample_chunks)
