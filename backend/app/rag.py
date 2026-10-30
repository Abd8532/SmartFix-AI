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
        "org_id": "public_base",
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
        "org_id": "public_base",
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
        "org_id": "public_base",
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
    """
    Extract recognized campus building, floor, room, or facility landmarks.
    Recognizes patterns such as:
      - 'ab 12 room 1', 'ab 7 floor 3', 'ab 12', 'ab 7'
      - 'room 101', 'room 204', 'floor 3', 'lab 2'
      - 'cafeteria', 'server room', 'carrow library', 'keller science center'
    """
    if not complaint:
        return None

    lower = complaint.lower()

    # 1. Regex pattern for Academic Blocks with optional room / floor
    # e.g., 'ab 12 room 1', 'ab 7 floor 3', 'ab 12', 'ab-7'
    ab_match = re.search(r"\b(?:ab|block|building)\s*[-_]?\s*(\d+[a-z]?)(?:\s*(?:room|floor|fl|rm|lab)?\s*(\d+[a-z]?))?\b", lower)
    if ab_match:
        block_num = ab_match.group(1)
        sub_unit = ab_match.group(2)
        if sub_unit:
            if "floor" in lower or "fl" in lower:
                return f"AB {block_num.upper()} Floor {sub_unit.upper()}"
            return f"AB {block_num.upper()} Room {sub_unit.upper()}"
        return f"AB {block_num.upper()}"

    # 2. General Room / Lab / Floor pattern
    room_match = re.search(r"\b(room|rm|lab|hall|studio)\s*[-_]?\s*(\d+[a-z]?)\b", lower)
    if room_match:
        return f"{room_match.group(1).capitalize()} {room_match.group(2).upper()}"

    floor_match = re.search(r"\b(floor|level)\s*(\d+)\b", lower)
    if floor_match:
        return f"Floor {floor_match.group(2)}"

    # 3. Known campus landmarks
    landmarks = [
        ("cafeteria kitchen", "Cafeteria Kitchen"),
        ("cafeteria", "Cafeteria"),
        ("carrow library", "Carrow Library"),
        ("keller science center", "Keller Science Center"),
        ("keller science", "Keller Science Center"),
        ("hartwell hall", "Hartwell Hall"),
        ("server room", "Server Room"),
        ("restroom", "Restroom"),
        ("library", "Campus Library"),
        ("gym", "Campus Gym"),
        ("auditorium", "Campus Auditorium"),
        ("study hall", "Study Hall")
    ]
    for lm_key, lm_label in landmarks:
        if lm_key in lower:
            return lm_label

    return None


def extract_category_entity(complaint: str) -> str:
    """
    Strict Single-Specialty Classifier.
    Assigns ticket strictly to ONE specific department:
    'Plumbing', 'Electrical', 'HVAC', 'IT', or 'General'.
    """
    if not complaint:
        return "General"

    lower = complaint.lower()
    electrical_keywords = [
        "electric", "electrical", "wire", "wiring", "breaker", "spark", "panel",
        "voltage", "light", "lights", "bulb", "tube", "fan", "switch", "socket",
        "outlet", "power", "short circuit", "blackout", "ups", "generator",
        "inverter", "ward light", "fuse", "shock"
    ]
    if any(k in lower for k in electrical_keywords):
        return "Electrical"
    if any(k in lower for k in ["pipe", "leak", "sink", "water", "drain", "toilet", "tap", "flood", "sewage", "faucet", "spraying", "flush"]):
        return "Plumbing"
    if any(k in lower for k in ["ac", "air condition", "hvac", "heater", "cooling", "chiller", "ventilation", "compressor", "thermostat", "duct", "refriger"]):
        return "HVAC"
    if any(k in lower for k in ["server", "wifi", "wi-fi", "router", "network", "cable", "lan", "monitor", "pc", "computer", "ethernet", "internet"]):
        return "IT"
    return "General"


def compute_priority_metrics(
    complaint: str,
    rag_ticket_volume: int = 0,
    weather_context: Optional[Dict[str, Any]] = None
) -> Tuple[str, int, bool, str]:
    """
    RAG-Driven Priority & Criticality Engine:
    Base Criticality Assessment (from keywords & symptoms):
      - Critical / Hazard (Base Score 55): Live wires, sparks, fire, burst pipe, active flooding, emergency ward/medical equipment, server room cooling/power failure.
      - High Operational Impact (Base Score 40): Water/pipe leakage (pipe leakage), AC/HVAC failure in classrooms/labs (ab 12), Wi-Fi/network outage, main lighting failure.
      - Moderate Impact (Base Score 25): Single fixture, noisy fan, slow drain, door/lock repair.
      - Routine (Base Score 15): Minor cosmetic wear.

    RAG Ticket Volume Escalation (ragTicketVolume Multiplier):
      - 0 prior matches (1st ticket): +0 pts (Urgency determined by Base Criticality + Weather).
      - 1 prior RAG match (2nd ticket on this issue): +20 pts and automatically bump urgency up 1 tier (e.g. Routine -> Moderate, Moderate -> Urgent).
      - 2 prior RAG matches (3rd ticket on this issue): +35 pts and force urgency to at least 'Urgent'.
      - >= 3 prior RAG matches (4+ tickets raised): +50 pts and force urgency to 'Emergency' (Score 90–100).

    Final Urgency Tiers from Total Score (0–100):
      - Score >= 80: 'Emergency'
      - Score 55–79: 'Urgent'
      - Score 35–54: 'Moderate'
      - Score < 35: 'Routine'
    """
    lower = (complaint or "").lower()

    # 1. Base Criticality Assessment
    is_hazard = False
    # Critical / Hazard (Base Score 55)
    if any(k in lower for k in [
        "live wire", "spark", "sparking", "fire", "burst pipe", "active flood", "flooding",
        "emergency ward", "medical equipment", "server room cooling", "server room power",
        "gas leak", "smoke", "chemical spill", "structural collapse", "arc flash", "shock"
    ]):
        base_score = 55
        base_tier = "Urgent"
        is_hazard = True
        tier_reason = "Base Criticality: Critical Hazard"
    # High Operational Impact (Base Score 40)
    elif any(k in lower for k in [
        "pipe leak", "pipe leakage", "water leak", "water leakage", "leakage",
        "ac failure", "hvac failure", "chiller failure", "classroom", "lab", "ab 12",
        "wifi", "wi-fi", "network outage", "main light", "main lighting", "breaker trip", "power outage"
    ]):
        base_score = 40
        base_tier = "Moderate"
        is_hazard = False
        tier_reason = "Base Criticality: High Operational Impact"
    # Moderate Impact (Base Score 25)
    elif any(k in lower for k in [
        "single fixture", "noisy fan", "slow drain", "door", "lock", "faucet",
        "dripping", "fan", "drain", "flush", "switch", "handle", "outlet"
    ]):
        base_score = 25
        base_tier = "Routine"
        is_hazard = False
        tier_reason = "Base Criticality: Moderate Impact"
    # Routine (Base Score 15)
    else:
        base_score = 15
        base_tier = "Routine"
        is_hazard = False
        tier_reason = "Base Criticality: Routine Facilities Maintenance"

    # 2. Weather adjustment (if extreme weather impacts system)
    weather_pts = 0
    if weather_context:
        temp_c = weather_context.get("temperatureC", 25.0)
        precip = weather_context.get("precipitationMm", 0.0)
        if (temp_c > 35 or temp_c < 10) and any(k in lower for k in ["ac", "hvac", "cooling", "heat", "chiller"]):
            weather_pts = 5
        elif precip > 2.0 and any(k in lower for k in ["roof", "leak", "water", "flood", "drain"]):
            weather_pts = 5

    # 3. RAG Ticket Volume Escalation
    if rag_ticket_volume >= 3:
        vol_pts = 50
    elif rag_ticket_volume == 2:
        vol_pts = 35
    elif rag_ticket_volume == 1:
        vol_pts = 20
    else:
        vol_pts = 0

    total_score = base_score + weather_pts + vol_pts

    # 4. Final Urgency Tiers & Floor Enforcement
    tier_order = ["Routine", "Moderate", "Urgent", "Emergency"]

    if total_score >= 80:
        urgency = "Emergency"
    elif total_score >= 55:
        urgency = "Urgent"
    elif total_score >= 35:
        urgency = "Moderate"
    else:
        urgency = "Routine"

    # Enforce RAG volume tier bump & floors
    if rag_ticket_volume == 1:
        # Bump urgency up 1 tier from base_tier
        base_idx = tier_order.index(base_tier) if base_tier in tier_order else 0
        bumped_tier = tier_order[min(len(tier_order) - 1, base_idx + 1)]
        curr_idx = tier_order.index(urgency) if urgency in tier_order else 0
        target_idx = max(curr_idx, tier_order.index(bumped_tier))
        urgency = tier_order[target_idx]
        if urgency == "Moderate":
            total_score = max(total_score, 35)
        elif urgency == "Urgent":
            total_score = max(total_score, 55)
        elif urgency == "Emergency":
            total_score = max(total_score, 80)

    elif rag_ticket_volume == 2:
        # Force urgency to at least 'Urgent'
        curr_idx = tier_order.index(urgency) if urgency in tier_order else 0
        if curr_idx < 2:  # Below Urgent
            urgency = "Urgent"
            total_score = max(total_score, 55)

    elif rag_ticket_volume >= 3:
        # Force urgency to 'Emergency' (Score 90–100)
        urgency = "Emergency"
        total_score = max(total_score, 90)
        is_hazard = True

    if urgency == "Emergency":
        is_hazard = True

    final_score = max(0, min(100, total_score))
    reasoning = (
        f"{tier_reason} (Base {base_score} pts) + Weather ({weather_pts} pts) + "
        f"RAG Volume Escalation ({vol_pts} pts for {rag_ticket_volume} prior reports) -> "
        f"Final Urgency: {urgency} (Score: {final_score}/100)."
    )

    return urgency, final_score, is_hazard, reasoning


def retrieve_rag_ticket_history(
    complaint: str,
    org_id: str = "org_campus_main",
    location_hint: Optional[str] = None,
    storage_instance = None,
    top_k: int = 10
) -> Tuple[int, Dict[str, Any], List[Dict[str, Any]]]:
    """
    RAG Historical & Active Ticket Volume Retrieval.
    Query vector store (top_k=10) AND active/historical tickets to retrieve all semantically
    similar records matching the same location and fault type.
    Calculates ragTicketVolume and builds structured ragHistorySummary.
    """
    loc_entity = location_hint or extract_location_entity(complaint)
    cat_entity = extract_category_entity(complaint)

    # 1. Query vector store matches
    vector_matches = []
    if PINECONE_AVAILABLE and PINECONE_API_KEY:
        emb = get_real_embedding(complaint)
        if emb:
            try:
                pc = Pinecone(api_key=PINECONE_API_KEY)
                existing = [i.name for i in pc.list_indexes()]
                if PINECONE_INDEX_NAME in existing:
                    index = pc.Index(PINECONE_INDEX_NAME)
                    results = index.query(
                        vector=emb,
                        top_k=top_k,
                        include_metadata=True,
                        filter={"org_id": {"$eq": org_id}}
                    )
                    for m in results.matches:
                        if m.metadata:
                            vector_matches.append(dict(m.metadata))
            except Exception as e:
                print(f"[RAG Vector Retrieval Notice]: {e}")

    # 2. Query active & historical tickets in storage
    storage_tickets = []
    if storage_instance is not None:
        try:
            storage_tickets = storage_instance.list_tickets(org_id, role="admin", user_id="system")
        except Exception:
            storage_tickets = []
    else:
        try:
            from .storage import storage
            storage_tickets = storage.list_tickets(org_id, role="admin", user_id="system")
        except Exception:
            storage_tickets = []

    # 3. Combine candidate pools with tenant isolation
    all_candidates = []
    seen_ids = set()
    for item in (vector_matches + storage_tickets + SEED_VERIFIED_REPAIRS):
        if not isinstance(item, dict):
            continue
        item_org = item.get("org_id") or item.get("OrgId") or "org_campus_main"
        if item_org not in (org_id, "public_base"):
            continue
        t_id = item.get("id") or item.get("ticket_id") or item.get("ID")
        if t_id and t_id in seen_ids:
            continue
        if t_id:
            seen_ids.add(t_id)
        all_candidates.append(item)

    # 4. Strict filter for matching same location and fault type
    matching_records = []
    loc_lower = (loc_entity or "").lower().strip()
    loc_tokens = set(re.findall(r"\w+", loc_lower)) if loc_lower else set()

    for item in all_candidates:
        item_loc = str(item.get("location") or item.get("Location") or "").lower().strip()
        item_cat = str(item.get("category") or item.get("Category") or "").capitalize()
        item_desc = f"{item.get('title', '')} {item.get('description', '')} {item.get('complaint', '')}".lower()

        # Location matching (item must have a non-empty location)
        location_matches = False
        if loc_tokens and item_loc:
            item_loc_tokens = set(re.findall(r"\w+", item_loc))
            if loc_lower in item_loc or item_loc in loc_lower:
                location_matches = True
            elif loc_tokens and loc_tokens.issubset(item_loc_tokens):
                location_matches = True
            elif any(k in loc_tokens for k in ["ab", "cafeteria", "server", "library"]) and (loc_tokens & item_loc_tokens):
                block_tokens = [tok for tok in loc_tokens if tok.isdigit()]
                if not block_tokens or all(b in item_loc_tokens for b in block_tokens):
                    location_matches = True
        else:
            location_matches = False

        # Category/Fault matching
        cat_matches = (item_cat == cat_entity)
        if not cat_matches:
            if cat_entity == "Plumbing" and any(k in item_desc for k in ["pipe", "leak", "sink", "water"]):
                cat_matches = True
            elif cat_entity == "Electrical" and any(k in item_desc for k in ["spark", "wire", "breaker", "power"]):
                cat_matches = True
            elif cat_entity == "HVAC" and any(k in item_desc for k in ["ac", "chiller", "cooling", "hvac"]):
                cat_matches = True
            elif cat_entity == "IT" and any(k in item_desc for k in ["wifi", "server", "router", "network"]):
                cat_matches = True

        if location_matches and cat_matches:
            matching_records.append(item)

    rag_ticket_volume = len(matching_records)

    # 5. Build structured ragHistorySummary
    past_causes = [r.get("rootCause") for r in matching_records if r.get("rootCause")]
    past_fixes = [r.get("fixApplied") or r.get("resolutionNotes") or r.get("resolution_notes") for r in matching_records if (r.get("fixApplied") or r.get("resolutionNotes") or r.get("resolution_notes"))]

    rag_history_summary = {
        "priorReportsCount": rag_ticket_volume,
        "location": loc_entity or "Campus Facilities",
        "category": cat_entity,
        "pastRootCauses": past_causes,
        "previousFixesAttempted": past_fixes,
        "matchingTicketIds": [r.get("id") for r in matching_records if r.get("id")],
        "summaryText": (
            f"Vector search identified {rag_ticket_volume} prior/active record(s) matching equipment at '{loc_entity or 'location'}'. "
            f"Root causes: {', '.join(past_causes) if past_causes else 'Under recurrent inspection'}. "
            f"Past fixes: {', '.join(past_fixes) if past_fixes else 'None previously recorded'}."
            if rag_ticket_volume > 0 else
            "No prior tickets found for this equipment and location (Initial report)."
        )
    }

    return rag_ticket_volume, rag_history_summary, matching_records


def keyword_search_fallback(
    complaint: str,
    org_id: Optional[str] = None,
    location_filter: Optional[str] = None,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """
    Explicitly labelled keyword/lexical fallback search when vector store or embeddings are offline.
    Enforces tenant boundaries: records from other organisations are strictly excluded.
    Returns search_mode: 'keyword_fallback'.
    """
    query_tokens = set(re.findall(r"\w+", complaint.lower()))
    scored_records = []

    for item in SEED_VERIFIED_REPAIRS:
        # Tenant isolation boundary check
        item_org = item.get("org_id")
        if org_id and item_org and item_org != org_id and item_org != "public_base":
            continue

        doc_text = f"{item.get('title', '')} {item.get('description', '')} {item.get('location', '')} {item.get('category', '')} {item.get('fixApplied', '')} {item.get('resolutionNotes', '')} {item.get('resolution_notes', '')}".lower()
        doc_tokens = set(re.findall(r"\w+", doc_text))

        overlap = len(query_tokens.intersection(doc_tokens))
        score = overlap / max(len(query_tokens), 1)

        if location_filter and location_filter in item.get("location", "").lower():
            score += 0.4

        scored_records.append({
            "id": item.get("id", "rec_0"),
            "score": round(min(score, 1.0), 3),
            "search_mode": "keyword_fallback",
            "resolutionNotes": item.get("fixApplied") or item.get("resolutionNotes") or item.get("resolution_notes") or "",
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
    Enforces strict tenant isolation in both vector and keyword queries.
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

    # 2. Explicitly labelled keyword search fallback with mandatory tenant isolation
    fallback_matches = keyword_search_fallback(complaint, org_id=org_id, location_filter=loc_filter, top_k=top_k)
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

    # Also record in local verified seed storage for current session with tenant isolation
    SEED_VERIFIED_REPAIRS.append({
        "id": ticket["id"],
        "ticket_id": ticket["id"],
        "org_id": org_id,
        "title": ticket.get("title", "Maintenance Fault"),
        "category": ticket.get("category", "General"),
        "urgency": ticket.get("priority", "Routine"),
        "location": ticket.get("location", "Campus Facilities"),
        "description": ticket.get("description", ""),
        "assignedTo": ticket.get("assignedTo", "Field Technician"),
        "fixApplied": resolution_notes,
        "verified": True,
        "approval_status": "Completed",
        "resolvedAt": ticket.get("resolvedAt", datetime.utcnow().isoformat())
    })
    return True
