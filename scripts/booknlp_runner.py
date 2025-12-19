#!/usr/bin/env python3
"""
BookNLP Runner - Produces Clean JSON Contract for ARES

This script runs BookNLP and transforms its output into a versioned,
stable JSON contract that ARES can ingest. It can be run standalone
or as part of the booknlp_service.py HTTP service.

Output Contract (schema_version: "1.0"):
{
  "schema_version": "1.0",
  "document_id": "...",
  "metadata": { ... },
  "characters": [ ... ],
  "mentions": [ ... ],
  "coref_chains": [ ... ],
  "quotes": [ ... ],
  "tokens": [ ... ]
}
"""

import os
import sys
import json
import tempfile
import time
import uuid
import hashlib
from pathlib import Path
from typing import Dict, Any, List, Optional, TypedDict
from dataclasses import dataclass, asdict
from collections import defaultdict

# Schema version - bump when contract changes
SCHEMA_VERSION = "1.0"

# ============================================================================
# TYPE DEFINITIONS (Contract Schema)
# ============================================================================

class CharacterAlias(TypedDict):
    text: str
    count: int

class Character(TypedDict):
    id: str  # Stable ID: "char_{cluster_id}"
    canonical_name: str
    aliases: List[CharacterAlias]
    mention_count: int
    gender: Optional[str]  # "male", "female", "unknown"
    agent_score: float  # How often this character is the subject/agent

class Mention(TypedDict):
    id: str  # "mention_{idx}"
    character_id: Optional[str]  # Links to Character.id if resolved
    text: str
    start_token: int
    end_token: int
    start_char: int
    end_char: int
    sentence_idx: int
    mention_type: str  # "PROP" (proper), "NOM" (nominal), "PRON" (pronoun)
    entity_type: str  # "PER", "LOC", "ORG", "FAC", "GPE", "VEH"

class CorefChain(TypedDict):
    chain_id: str
    character_id: Optional[str]
    mentions: List[str]  # List of Mention.id

class Quote(TypedDict):
    id: str
    text: str
    start_token: int
    end_token: int
    start_char: int
    end_char: int
    speaker_id: Optional[str]  # Character.id of speaker
    speaker_name: Optional[str]  # Canonical name of speaker
    addressee_id: Optional[str]
    quote_type: str  # "explicit", "implicit", "anaphoric"

class Token(TypedDict):
    idx: int
    text: str
    lemma: str
    pos: str
    ner: str
    start_char: int
    end_char: int
    sentence_idx: int
    paragraph_idx: int

class BookNLPContract(TypedDict):
    schema_version: str
    document_id: str
    metadata: Dict[str, Any]
    characters: List[Character]
    mentions: List[Mention]
    coref_chains: List[CorefChain]
    quotes: List[Quote]
    tokens: List[Token]


# ============================================================================
# BOOKNLP OUTPUT PARSING
# ============================================================================

def parse_tsv_file(path: Path) -> List[Dict[str, str]]:
    """Parse a TSV file into a list of dicts keyed by header names."""
    if not path.exists():
        return []

    rows: List[Dict[str, str]] = []
    lines = path.read_text(encoding="utf-8").strip().split("\n")
    if not lines:
        return rows

    headers = lines[0].split("\t")
    for line in lines[1:]:
        parts = line.split("\t")
        row = {headers[i]: parts[i] if i < len(parts) else "" for i in range(len(headers))}
        rows.append(row)
    return rows


def build_token_index(tokens_file: Path, text: str) -> List[Token]:
    """Build token list with character offsets from BookNLP .tokens file."""
    rows = parse_tsv_file(tokens_file)
    tokens: List[Token] = []

    # BookNLP tokens file columns:
    # paragraph_id, sentence_id, token_id_within_sentence, word, lemma, byte_onset, byte_offset, POS_tag, ...
    for row in rows:
        try:
            byte_start = int(row.get("byte_onset", "0"))
            byte_end = int(row.get("byte_offset", "0"))

            tokens.append({
                "idx": len(tokens),
                "text": row.get("word", ""),
                "lemma": row.get("lemma", row.get("word", "")),
                "pos": row.get("POS_tag", row.get("pos", "")),
                "ner": row.get("NER_tag", row.get("ner", "O")),
                "start_char": byte_start,
                "end_char": byte_end,
                "sentence_idx": int(row.get("sentence_id", "0")),
                "paragraph_idx": int(row.get("paragraph_id", "0")),
            })
        except (ValueError, KeyError):
            continue

    return tokens


def build_characters_and_mentions(
    entities_file: Path,
    tokens: List[Token]
) -> tuple[List[Character], List[Mention], Dict[int, str]]:
    """
    Build character and mention lists from BookNLP .entities file.

    BookNLP entities file columns typically include:
    - COREF (cluster ID)
    - start_token, end_token
    - text
    - mention_type (PROP/NOM/PRON)
    - entity_type (PER/LOC/ORG/etc.)
    - name (canonical name for the cluster)
    """
    rows = parse_tsv_file(entities_file)

    # Group mentions by cluster ID
    cluster_mentions: Dict[int, List[Dict]] = defaultdict(list)
    mentions: List[Mention] = []
    cluster_to_char_id: Dict[int, str] = {}

    for i, row in enumerate(rows):
        try:
            coref_id = int(row.get("COREF", "-1"))
            start_tok = int(row.get("start_token", "0"))
            end_tok = int(row.get("end_token", "0"))

            # Get character offsets from tokens
            start_char = tokens[start_tok]["start_char"] if start_tok < len(tokens) else 0
            end_char = tokens[end_tok]["end_char"] if end_tok < len(tokens) else 0

            mention_type = row.get("mention_type", row.get("cat", "PROP"))
            entity_type = row.get("entity_type", row.get("ner", "PER"))
            text = row.get("text", "")

            # Generate character ID from cluster
            char_id = f"char_{coref_id}" if coref_id >= 0 else None
            if coref_id >= 0:
                cluster_to_char_id[coref_id] = char_id

            mention: Mention = {
                "id": f"mention_{i}",
                "character_id": char_id,
                "text": text,
                "start_token": start_tok,
                "end_token": end_tok,
                "start_char": start_char,
                "end_char": end_char,
                "sentence_idx": tokens[start_tok]["sentence_idx"] if start_tok < len(tokens) else 0,
                "mention_type": mention_type,
                "entity_type": entity_type,
            }
            mentions.append(mention)

            if coref_id >= 0:
                cluster_mentions[coref_id].append({
                    "text": text,
                    "type": mention_type,
                    "canonical": row.get("name", text),
                })

        except (ValueError, KeyError, IndexError):
            continue

    # Build characters from clusters
    characters: List[Character] = []
    for cluster_id, cluster_data in cluster_mentions.items():
        # Count alias occurrences
        alias_counts: Dict[str, int] = defaultdict(int)
        canonical_name = ""

        for m in cluster_data:
            alias_counts[m["text"]] += 1
            # Use the "name" field from BookNLP as canonical, or pick most common
            if m.get("canonical"):
                canonical_name = m["canonical"]

        if not canonical_name:
            # Pick most frequent alias as canonical
            canonical_name = max(alias_counts.items(), key=lambda x: x[1])[0]

        aliases: List[CharacterAlias] = [
            {"text": text, "count": count}
            for text, count in sorted(alias_counts.items(), key=lambda x: -x[1])
            if text != canonical_name  # Don't include canonical in aliases
        ]

        characters.append({
            "id": f"char_{cluster_id}",
            "canonical_name": canonical_name,
            "aliases": aliases,
            "mention_count": len(cluster_data),
            "gender": None,  # TODO: extract from BookNLP if available
            "agent_score": 0.0,  # TODO: calculate from syntax
        })

    return characters, mentions, cluster_to_char_id


def build_coref_chains(
    mentions: List[Mention],
    cluster_to_char_id: Dict[int, str]
) -> List[CorefChain]:
    """Build coreference chains from mentions grouped by character."""
    chains_by_char: Dict[str, List[str]] = defaultdict(list)

    for mention in mentions:
        if mention["character_id"]:
            chains_by_char[mention["character_id"]].append(mention["id"])

    chains: List[CorefChain] = []
    for char_id, mention_ids in chains_by_char.items():
        chains.append({
            "chain_id": f"chain_{char_id}",
            "character_id": char_id,
            "mentions": mention_ids,
        })

    return chains


def build_quotes(
    quotes_file: Path,
    tokens: List[Token],
    cluster_to_char_id: Dict[int, str],
    characters: List[Character]
) -> List[Quote]:
    """
    Build quotes list from BookNLP .quotes file.

    BookNLP quotes file columns typically include:
    - quote_start, quote_end (token indices)
    - char_id (speaker cluster ID)
    - quote text
    """
    rows = parse_tsv_file(quotes_file)
    quotes: List[Quote] = []

    # Build lookup for character names
    char_id_to_name: Dict[str, str] = {
        c["id"]: c["canonical_name"] for c in characters
    }

    for i, row in enumerate(rows):
        try:
            start_tok = int(row.get("quote_start", row.get("start", "0")))
            end_tok = int(row.get("quote_end", row.get("end", "0")))

            # Get character offsets
            start_char = tokens[start_tok]["start_char"] if start_tok < len(tokens) else 0
            end_char = tokens[end_tok]["end_char"] if end_tok < len(tokens) else 0

            # Get speaker
            speaker_cluster = row.get("char_id", row.get("speaker", ""))
            speaker_id = None
            speaker_name = None

            if speaker_cluster and speaker_cluster != "_" and speaker_cluster != "-1":
                try:
                    cluster_int = int(speaker_cluster)
                    speaker_id = cluster_to_char_id.get(cluster_int)
                    if speaker_id:
                        speaker_name = char_id_to_name.get(speaker_id)
                except ValueError:
                    pass

            # Get quote text
            quote_text = row.get("quote", "")
            if not quote_text and start_tok < len(tokens) and end_tok < len(tokens):
                quote_text = " ".join(t["text"] for t in tokens[start_tok:end_tok+1])

            quotes.append({
                "id": f"quote_{i}",
                "text": quote_text,
                "start_token": start_tok,
                "end_token": end_tok,
                "start_char": start_char,
                "end_char": end_char,
                "speaker_id": speaker_id,
                "speaker_name": speaker_name,
                "addressee_id": None,  # TODO: extract if available
                "quote_type": row.get("type", "explicit"),
            })
        except (ValueError, KeyError, IndexError):
            continue

    return quotes


# ============================================================================
# MAIN CONTRACT BUILDER
# ============================================================================

def build_contract(
    output_dir: Path,
    document_id: str,
    original_text: str,
    duration_seconds: float,
    booknlp_version: str = "1.0.8",
) -> BookNLPContract:
    """
    Build the clean JSON contract from BookNLP output files.

    Expected files in output_dir:
    - {doc_id}.tokens
    - {doc_id}.entities
    - {doc_id}.quotes
    - {doc_id}.supersense (optional)
    """
    # Find the actual file prefix (BookNLP uses the input filename as prefix)
    tokens_files = list(output_dir.glob("*.tokens"))
    if not tokens_files:
        raise ValueError(f"No .tokens file found in {output_dir}")

    prefix = tokens_files[0].stem

    tokens_file = output_dir / f"{prefix}.tokens"
    entities_file = output_dir / f"{prefix}.entities"
    quotes_file = output_dir / f"{prefix}.quotes"

    # Build token index first
    tokens = build_token_index(tokens_file, original_text)

    # Build characters and mentions
    characters, mentions, cluster_to_char_id = build_characters_and_mentions(
        entities_file, tokens
    )

    # Build coref chains
    coref_chains = build_coref_chains(mentions, cluster_to_char_id)

    # Build quotes
    quotes = build_quotes(quotes_file, tokens, cluster_to_char_id, characters)

    # Generate document fingerprint
    text_hash = hashlib.sha256(original_text.encode("utf-8")).hexdigest()[:16]

    return {
        "schema_version": SCHEMA_VERSION,
        "document_id": document_id,
        "metadata": {
            "booknlp_version": booknlp_version,
            "text_length": len(original_text),
            "text_hash": text_hash,
            "processing_time_seconds": round(duration_seconds, 3),
            "token_count": len(tokens),
            "sentence_count": max((t["sentence_idx"] for t in tokens), default=0) + 1 if tokens else 0,
            "character_count": len(characters),
            "mention_count": len(mentions),
            "quote_count": len(quotes),
        },
        "characters": characters,
        "mentions": mentions,
        "coref_chains": coref_chains,
        "quotes": quotes,
        "tokens": tokens,
    }


def run_booknlp_and_build_contract(
    text: str,
    document_id: Optional[str] = None,
    model: str = "small",
    output_dir: Optional[Path] = None,
) -> BookNLPContract:
    """
    Run BookNLP on text and return the clean contract.

    Args:
        text: Input text to process
        document_id: Optional document ID (generated if not provided)
        model: BookNLP model ("small" or "big")
        output_dir: Optional output directory (temp dir used if not provided)

    Returns:
        BookNLPContract dict
    """
    try:
        from booknlp.booknlp import BookNLP
    except ImportError:
        raise RuntimeError(
            "BookNLP not installed. Install with: pip install booknlp"
        )

    if not document_id:
        document_id = f"doc_{uuid.uuid4().hex[:8]}"

    # Initialize BookNLP
    model_params = {
        "pipeline": "entity,quote,coref",
        "model": model,
    }
    booknlp = BookNLP("en", model_params)

    # Run in temp directory
    use_temp = output_dir is None
    if use_temp:
        import tempfile
        temp_dir = tempfile.mkdtemp(prefix="booknlp_")
        output_dir = Path(temp_dir)

    try:
        # Write input text
        input_file = output_dir / f"{document_id}.txt"
        input_file.write_text(text, encoding="utf-8")

        # Run BookNLP
        start_time = time.time()
        booknlp.process(str(input_file), document_id, str(output_dir))
        duration = time.time() - start_time

        # Build contract
        contract = build_contract(
            output_dir=output_dir,
            document_id=document_id,
            original_text=text,
            duration_seconds=duration,
        )

        return contract

    finally:
        if use_temp:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)


# ============================================================================
# CLI
# ============================================================================

def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Run BookNLP and produce clean JSON contract for ARES"
    )
    parser.add_argument("input", help="Input text file")
    parser.add_argument("-o", "--output", help="Output JSON file (stdout if not specified)")
    parser.add_argument("--doc-id", help="Document ID")
    parser.add_argument("--model", default="small", choices=["small", "big"],
                       help="BookNLP model size")

    args = parser.parse_args()

    # Read input
    text = Path(args.input).read_text(encoding="utf-8")
    doc_id = args.doc_id or Path(args.input).stem

    # Run
    contract = run_booknlp_and_build_contract(
        text=text,
        document_id=doc_id,
        model=args.model,
    )

    # Output
    output_json = json.dumps(contract, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(output_json, encoding="utf-8")
        print(f"Wrote contract to {args.output}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
