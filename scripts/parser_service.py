import os
import logging

# Ensure BLIS uses a portable kernel to avoid SIGFPE on some CPUs (e.g., Apple Silicon)
os.environ.setdefault("BLIS_ARCH", "generic")
# Force thinc to use pure numpy ops to avoid BLIS entirely on unsupported CPUs
os.environ.setdefault("THINC_CPU_OPS", "numpy")

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Dict, Any, List
import spacy

logger = logging.getLogger("ares.parser")
logging.basicConfig(level=logging.INFO)

# Load spaCy, but fall back gracefully if native deps crash
try:
    # Load a small English model; disable components we don't need for speed
    nlp = spacy.load("en_core_web_sm", disable=["textcat"])
    logger.info("Loaded spaCy model en_core_web_sm successfully.")
except Exception as exc:
    logger.warning("Failed to load en_core_web_sm (reason: %s). Falling back to blank English pipeline.", exc)
    from spacy.lang.en import English

    nlp = English()
    if "sentencizer" not in nlp.pipe_names:
        nlp.add_pipe("sentencizer")

app = FastAPI()


class ParseReq(BaseModel):
    text: str


def token_payload(token, sentence_start: int, local_index: int) -> Dict[str, Any]:
    """Convert a spaCy token into the JSON payload expected by the TS pipeline."""
    return {
        "i": local_index,
        "text": token.text,
        "lemma": token.lemma_,
        "pos": token.pos_,
        "tag": token.tag_,
        "dep": token.dep_,
        "head": token.head.i - sentence_start,
        "start": token.idx,
        "end": token.idx + len(token.text),
        "ent": token.ent_type_ if token.ent_iob_ != "O" else ""
    }


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/parse")
def parse(req: ParseReq) -> Dict[str, Any]:
    doc = nlp(req.text)

    sentences: List[Dict[str, Any]] = []

    for idx, sent in enumerate(doc.sents):
        sentence_start = sent.start
        sentence_tokens = [
            token_payload(tok, sentence_start, local_index)
            for local_index, tok in enumerate(sent)
        ]

        sentences.append({
            "sentence_index": idx,
            "start": sent.start_char,
            "end": sent.end_char,
            "tokens": sentence_tokens
        })

    return {"sentences": sentences}
