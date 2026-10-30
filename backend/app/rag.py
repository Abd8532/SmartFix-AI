"""
RAG Knowledge Base & Pinecone Vector Store Integration for FixFlow AI
Implements real semantic vector embedding, labelled keyword fallback, and trusted knowledge ingestion.
"""
import re
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from .config import (
    GEMINI_API_KEY,
    EMBEDDING_MODEL,
    PINECONE_API_KEY,
    PINECONE_INDEX_NAME,
    PINECONE_CLOUD,
    PINECONE_REGION
)

# GenAI availability check
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
except ImportError:
    GENAI_AVAILABLE = False

# Pinecone availability check
try:
    from pinecone import Pinecone, ServerlessSpec
    PINECONE_AVAILABLE = True
except ImportError:
    PINECONE_AVAILABLE = False

# Seed Historical Verified Repair Records for campus cold-start RAG retrieval
SEED_VERIFIED_REPAIRS = [
    {
        "id": "TICK-HIST-101",
        "title": "Cafeteria Sink Cold Water Pipe Leak",
        "category": "Plumbing",
        "urgency": "Routine",
        "location": "Cafeteria Kitchen · Main Prep Sink",
        "building": "cafeteria",
        "deviceTag": "PLUMB-SINK-CAF01",
        "description": "Slow drip on cold water feed under counter. Replaced compression ring and tightened valve shutoff.",
        "assignedTo": "Plumbing Tech",
        "rootCause": "Degraded compression fitting due to thermal contraction.",
        "fixApplied": "Fitted new brass compression washer and tested for 30 minutes under static pressure.",
        "verified": True,
        "resolvedAt": "2026-09-15T14:30:00Z"
    },
    {
        "id": "TICK-HIST-102",
        "title": "Keller Science Server Room Breaker Trip",
        "category": "Electrical",
        "urgency": "Urgent",
        "location": "Keller Science Center · Server Room 204",
        "building": "keller science center",
        "deviceTag": "ELEC-PNL-SR204",
        "description": "Sub-panel 40A circuit breaker tripped under heavy compute load. Reset breaker and rebalanced phase B.",
        "assignedTo": "Electrical Tech",
        "rootCause": "Phase imbalance causing transient amp spike on single leg.",
        "fixApplied": "Shifted rack 3 power distributor to phase A; load dropped below 80% breaker rating.",
        "verified": True,
        "resolvedAt": "2026-09-28T09:15:00Z"
    },
    {
        "id": "TICK-HIST-103",
        "title": "Carrow Library Rooftop Chiller Noise",
        "category": "HVAC",
        "urgency": "Routine",
        "location": "Carrow Library · Study Hall Rooftop",
        "building": "carrow library",
        "deviceTag": "HVAC-CHILL-LIB01",
        "description": "Chiller fan bearing chirping at high RPM. Lubricated bearing assembly and realigned fan shroud.",
        "assignedTo": "HVAC Specialist",
        "rootCause": "Dry bearing housing after hot summer run cycle.",
        "fixApplied": "High-temp synthetic grease injected into bearing nipple.",
        "verified": True,
        "resolvedAt": "2026-10-04T16:45:00Z"
    }
]


def get_real_embedding(text: str) -> Optional[List[float]]:
    """
    Generate real semantic vector embeddings using Google GenAI text-embedding-004.
    Returns None if GenAI is unavailable or unconfigured (Never uses fake random vectors).
    """
    if not GENAI_AVAILABLE or not GEMINI_API_KEY:
        return None

    try:
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=text,
            task_type="retrieval_query"
        )
        return result.get("embedding")
    except Exception as e:
        print(f"[RAG Embedding Notice]: Real embedding unavailable: {e}")
        return None


def extract_location_entity(complaint: str) -> Optional[str]:
    """Extract recognized campus building or facility landmarks."""
    if not complaint:
        return None

    lower = complaint.lower()
    landmarks = [
        "cafeteria", "carrow library", "keller science center", "hartwell hall",
        "demo building a", "demo building b", "demo building c", "demo building d",
        "demo building e", "server room", "restroom", "library", "gym", "auditorium"
    ]
    for lm in landmarks:
        if lm in lower:
            return lm
    return None


def keyword_search_fallback(
    complaint: str,
    location_filter: Optional[str] = None,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """
    Explicitly labelled keyword/lexical fallback search when vector store or embeddings are offline.
    Uses token overlap and location matching. Returns search_mode: 'keyword_fallback'.
    """
    query_tokens = set(re.findall(r"\w+", complaint.lower()))
    scored_records = []

    for item in SEED_VERIFIED_REPAIRS:
        doc_text = f"{item['title']} {item['description']} {item['location']} {item['category']}".lower()
        doc_tokens = set(re.findall(r"\w+", doc_text))

        overlap = len(query_tokens.intersection(doc_tokens))
        score = overlap / max(len(query_tokens), 1)

        if location_filter and location_filter in item.get("location", "").lower():
            score += 0.4

        scored_records.append({
            "id": item["id"],
            "score": round(min(score, 1.0), 3),
            "search_mode": "keyword_fallback",
            "metadata": item
        })

    scored_records.sort(key=lambda x: x["score"], reverse=True)
    return scored_records[:top_k]


def query_knowledge_base(
    complaint: str,
    org_id: str,
    top_k: int = 3
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Retrieve past matching historical equipment faults for context injection.
    Prefers Pinecone vector retrieval with real embeddings; falls back to labelled keyword search.
    Returns (matches_list, search_mode).
    """
    loc_filter = extract_location_entity(complaint)

    # 1. Attempt Pinecone real vector search
    if PINECONE_AVAILABLE and PINECONE_API_KEY:
        emb = get_real_embedding(complaint)
        if emb:
            try:
                pc = Pinecone(api_key=PINECONE_API_KEY)
                # Verify index exists
                existing = [i.name for i in pc.list_indexes()]
                if PINECONE_INDEX_NAME in existing:
                    index = pc.Index(PINECONE_INDEX_NAME)
                    query_filter = {"org_id": {"$eq": org_id}}
                    results = index.query(
                        vector=emb,
                        top_k=top_k,
                        include_metadata=True,
                        filter=query_filter
                    )
                    matches = []
                    for m in results.matches:
                        matches.append({
                            "id": m.id,
                            "score": round(float(m.score), 3),
                            "search_mode": "vector_semantic",
                            "metadata": m.metadata
                        })
                    if matches:
                        return matches, "vector_semantic"
            except Exception as e:
                print(f"[Pinecone Query Notice]: {e}, falling back to keyword search")

    # 2. Explicitly labelled keyword search fallback
    fallback_matches = keyword_search_fallback(complaint, location_filter=loc_filter, top_k=top_k)
    return fallback_matches, "keyword_fallback"


def ingest_verified_repair_to_rag(ticket: Dict[str, Any], org_id: str) -> bool:
    """
    Requirement 12:
    Only ingest verified technician repair reports into trusted RAG knowledge base.
    Unverified tickets are strictly rejected from entering the knowledge store.
    """
    # Strict verification gate
    is_completed = ticket.get("status") == "Completed"
    tech_confirmed = ticket.get("techConfirmed") is True or ticket.get("TechConfirmed") == "true"
    user_confirmed = ticket.get("userConfirmed") is True or ticket.get("UserConfirmed") == "true"

    if not (is_completed and tech_confirmed and user_confirmed):
        print("[RAG Ingestion Denied]: Ticket must be dual-confirmed and Completed to enter trusted knowledge.")
        return False

    resolution_notes = ticket.get("resolutionNotes") or ticket.get("fixApplied") or ""
    if not resolution_notes:
        print("[RAG Ingestion Denied]: Missing technician resolution log.")
        return False

    knowledge_text = (
        f"Title: {ticket.get('title')}\n"
        f"Category: {ticket.get('category')}\n"
        f"Location: {ticket.get('location')}\n"
        f"Problem: {ticket.get('description')}\n"
        f"Resolution Applied: {resolution_notes}\n"
        f"Resolved At: {ticket.get('resolvedAt') or datetime.utcnow().isoformat()}"
    )

    # If Pinecone is configured, generate real embedding and store
    if PINECONE_AVAILABLE and PINECONE_API_KEY:
        emb = get_real_embedding(knowledge_text)
        if emb:
            try:
                pc = Pinecone(api_key=PINECONE_API_KEY)
                existing = [i.name for i in pc.list_indexes()]
                if PINECONE_INDEX_NAME not in existing:
                    pc.create_index(
                        name=PINECONE_INDEX_NAME,
                        dimension=768,
                        metric="cosine",
                        spec=ServerlessSpec(cloud=PINECONE_CLOUD, region=PINECONE_REGION)
                    )
                index = pc.Index(PINECONE_INDEX_NAME)
                index.upsert(
                    vectors=[
                        {
                            "id": f"verified_{ticket['id']}",
                            "values": emb,
                            "metadata": {
                                "org_id": org_id,
                                "ticket_id": ticket["id"],
                                "title": ticket.get("title", ""),
                                "category": ticket.get("category", "General"),
                                "location": ticket.get("location", ""),
                                "verified": True,
                                "resolutionNotes": resolution_notes,
                                "resolvedAt": ticket.get("resolvedAt", datetime.utcnow().isoformat())
                            }
                        }
                    ]
                )
                print(f"✓ Ingested dual-verified ticket #{ticket['id']} into Pinecone trusted knowledge.")
                return True
            except Exception as e:
                print(f"[Pinecone Ingest Error]: {e}")

    # Also record in local verified seed storage for current session
    SEED_VERIFIED_REPAIRS.append({
        "id": ticket["id"],
        "title": ticket.get("title", "Maintenance Fault"),
        "category": ticket.get("category", "General"),
        "urgency": ticket.get("priority", "Routine"),
        "location": ticket.get("location", "Campus Facilities"),
        "description": ticket.get("description", ""),
        "assignedTo": ticket.get("assignedTo", "Field Technician"),
        "fixApplied": resolution_notes,
        "verified": True,
        "resolvedAt": ticket.get("resolvedAt", datetime.utcnow().isoformat())
    })
    return True
