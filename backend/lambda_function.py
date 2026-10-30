"""
FixFlow AI - AWS Lambda Backend (Context-Aware RAG & Lifecycle Pipeline)
========================================================================
Multimodal maintenance ticket analysis, dynamic weather-aware priority scoring,
device history attachment, and dual-approval closure workflow.
"""

import os
import json
import base64
import time
import re
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

# Third-party AI & Vector libraries
try:
    import google.generativeai as genai
    GOOGLE_GENAI_AVAILABLE = True
except ImportError:
    GOOGLE_GENAI_AVAILABLE = False

try:
    from pinecone import Pinecone, ServerlessSpec
    PINECONE_AVAILABLE = True
except ImportError:
    PINECONE_AVAILABLE = False

# ==============================================================================
# CONFIGURATION & ENVIRONMENT VARIABLES
# ==============================================================================
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "fixflow-maintenance-tickets")
PINECONE_CLOUD = os.environ.get("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.environ.get("PINECONE_REGION", "us-east-1")

AIRTABLE_API_KEY = os.environ.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_PAT", "")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID", "app32PCGpVp4lBamC")
AIRTABLE_TABLE_NAME = os.environ.get("AIRTABLE_TABLE_NAME", "tblyhV3Zxyw2wWzww")

# Campus Coordinates for Live Weather Telemetry (Default: New Delhi / NCR region)
CAMPUS_LAT = float(os.environ.get("CAMPUS_LAT", "28.6139"))
CAMPUS_LON = float(os.environ.get("CAMPUS_LON", "77.2090"))

EMBEDDING_MODEL = "models/text-embedding-004"
MULTIMODAL_MODEL = "gemini-1.5-flash"

if GEMINI_API_KEY and GOOGLE_GENAI_AVAILABLE:
    genai.configure(api_key=GEMINI_API_KEY)


# ==============================================================================
# SEED / FALLBACK HISTORICAL TICKETS
# ==============================================================================
SEED_HISTORICAL_TICKETS = [
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
        "resolvedAt": "2026-10-04T16:45:00Z"
    }
]


# ==============================================================================
# LIVE WEATHER & CLIMATE TELEMETRY
# ==============================================================================
def get_live_weather_context(lat: float = CAMPUS_LAT, lon: float = CAMPUS_LON) -> Dict[str, Any]:
    """
    Fetches real-time campus weather conditions using Open-Meteo API (No API key required).
    Used to dynamically adjust ticket urgency based on climate stress.
    """
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FixFlowAI-Lambda/2.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            curr = data.get("current", {})
            temp = curr.get("temperature_2m", 28.0)
            humidity = curr.get("relative_humidity_2m", 55)
            precip = curr.get("precipitation", 0.0)
            wind = curr.get("wind_speed_10m", 5.0)

            conditions = []
            if temp >= 35.0:
                conditions.append("Extreme Heat / High Cooling Load")
            elif temp <= 10.0:
                conditions.append("Cold Weather / Heating Critical")
            else:
                conditions.append("Moderate Temperature")

            if precip > 0.5:
                conditions.append("Active Rain / Wet Exterior Conditions")
            if humidity >= 75:
                conditions.append("High Humidity")

            return {
                "temperatureC": temp,
                "humidityPercent": humidity,
                "precipitationMm": precip,
                "windSpeedKmh": wind,
                "conditionSummary": ", ".join(conditions),
                "source": "Open-Meteo Live Telemetry"
            }
    except Exception as e:
        print(f"[Weather Telemetry Warning]: {e}. Using seasonal default.")
        return {
            "temperatureC": 32.0,
            "humidityPercent": 60,
            "precipitationMm": 0.0,
            "windSpeedKmh": 8.0,
            "conditionSummary": "Warm Ambient Conditions (Fallback)",
            "source": "Fallback Telemetry"
        }


# ==============================================================================
# HELPER FUNCTIONS: EMBEDDINGS, LOCATION & PINECONE
# ==============================================================================
def get_embedding(text: str) -> List[float]:
    if GOOGLE_GENAI_AVAILABLE and GEMINI_API_KEY:
        try:
            result = genai.embed_content(
                model=EMBEDDING_MODEL,
                content=text,
                task_type="retrieval_query"
            )
            return result["embedding"]
        except Exception as e:
            print(f"[Embedding Error]: {e}, using fallback vector")
    
    import hashlib, random
    seed = int(hashlib.md5(text.encode("utf-8")).hexdigest()[:8], 16)
    rng = random.Random(seed)
    raw = [rng.gauss(0, 1) for _ in range(768)]
    norm = sum(x ** 2 for x in raw) ** 0.5
    return [x / norm for x in raw]


def extract_location_entity(complaint: str) -> Optional[str]:
    if not complaint:
        return None
    text = complaint.strip()

    combo = re.search(r'\b((?:ab|block|bldg|building|hall|tower|wing)[\-\s]*[\w\d]+(?:\s*(?:room|rm|lab|fl|floor)\s*[\w\d\-]+)?)\b', text, re.IGNORECASE)
    if combo:
        return combo.group(1).strip()

    room = re.search(r'\b((?:server room|room|rm|lab|suite|office|floor)\s*[\w\d\-]+)\b', text, re.IGNORECASE)
    if room:
        return room.group(1).strip()

    facilities = [
        "carrow library", "keller science center", "keller science",
        "cafeteria kitchen", "cafeteria", "server room", "study hall",
        "student center", "engineering hall", "main gym", "dining hall"
    ]
    lower = text.lower()
    for fac in facilities:
        idx = lower.find(fac)
        if idx != -1:
            return text[idx:idx + len(fac)].strip()

    prep = re.search(r'\b(?:in|at|near|under|inside)\s+(?:the\s+)?([A-Za-z0-9\s\-]{2,30}?)(?=[,\.\?!]|\s+(?:is|has|was|the|a|an|we|pipe|leak|wire|ac|unit|fan|lights|heater)\b|$)', text, re.IGNORECASE)
    if prep:
        cand = prep[1].strip()
        if len(cand) > 2 and cand.lower() not in ['a', 'an', 'the', 'front', 'back', 'here', 'there']:
            return cand

    return None


def location_matches(loc_filter: str, ticket_loc: str, ticket_bldg: str = "") -> bool:
    if not loc_filter:
        return True
    lf = loc_filter.lower().strip()
    tl = (ticket_loc or "").lower().strip()
    tb = (ticket_bldg or "").lower().strip()

    if lf in tl or tl in lf or (tb and (lf in tb or tb in lf)):
        return True

    stopwords = {"room", "rm", "building", "bldg", "hall", "center", "the", "in", "at", "floor"}
    filter_tokens = {t for t in re.split(r'[\s\.\-]+', lf) if t and t not in stopwords}
    target_tokens = {t for t in re.split(r'[\s\.\-]+', f"{tl} {tb}") if t and t not in stopwords}

    if filter_tokens and filter_tokens.issubset(target_tokens):
        return True

    return False


def seed_index(index):
    """Upserts seed historical tickets into Pinecone (Syntax fixed)."""
    vectors_to_upsert = []
    for item in SEED_HISTORICAL_TICKETS:
        text = f"{item['title']} | {item['category']} | {item['location']} | {item['description']}"
        vec = get_embedding(text)
        meta = dict(item)
        if "building" not in meta:
            bldg = extract_location_entity(item["location"]) or item["location"]
            meta["building"] = bldg.lower().strip()
        vectors_to_upsert.append({
            "id": item["id"],
            "values": vec,
            "metadata": meta
        })
    try:
        index.upsert(vectors=vectors_to_upsert)
        print("✓ Pinecone index seeded with historical maintenance tickets.")
    except Exception as e:
        print(f"[Pinecone Seed Error]: {e}")


def query_pinecone_vector_store(
    query_text: str, 
    location_filter: Optional[str] = None, 
    top_k: int = 3
) -> List[Dict[str, Any]]:
    if not location_filter:
        location_filter = extract_location_entity(query_text)

    query_vector = get_embedding(query_text)
    retrieved_records = []

    if PINECONE_AVAILABLE and PINECONE_API_KEY:
        try:
            pc = Pinecone(api_key=PINECONE_API_KEY)
            existing_indexes = [idx.name for idx in pc.list_indexes()]
            if PINECONE_INDEX_NAME not in existing_indexes:
                pc.create_index(
                    name=PINECONE_INDEX_NAME,
                    dimension=768,
                    metric="cosine",
                    spec=ServerlessSpec(cloud=PINECONE_CLOUD, region=PINECONE_REGION)
                )
                time.sleep(2)
                seed_index(pc.Index(PINECONE_INDEX_NAME))

            index = pc.Index(PINECONE_INDEX_NAME)
            query_kwargs = {
                "vector": query_vector,
                "top_k": top_k,
                "include_metadata": True
            }
            if location_filter:
                query_kwargs["filter"] = {"building": {"$eq": location_filter.lower().strip()}}

            query_response = index.query(**query_kwargs)

            for match in query_response.get("matches", []):
                meta = match.get("metadata", {})
                retrieved_records.append({
                    "id": match.get("id"),
                    "score": match.get("score", 0.0),
                    "title": meta.get("title", ""),
                    "category": meta.get("category", ""),
                    "urgency": meta.get("urgency", ""),
                    "location": meta.get("location", ""),
                    "building": meta.get("building", ""),
                    "deviceTag": meta.get("deviceTag", "GEN-ASSET"),
                    "description": meta.get("description", ""),
                    "rootCause": meta.get("rootCause", "Unknown"),
                    "fixApplied": meta.get("fixApplied", meta.get("resolutionNotes", "Standard repair")),
                    "resolvedAt": meta.get("resolvedAt", meta.get("createdAt", ""))
                })
        except Exception as e:
            print(f"[Pinecone Query Warning]: {e}. Falling back to local hybrid match.")

    if location_filter and retrieved_records:
        retrieved_records = [
            rec for rec in retrieved_records 
            if location_matches(location_filter, rec.get("location", ""), rec.get("building", ""))
        ]

    if not retrieved_records:
        retrieved_records = get_local_historical_matches(query_text, location_filter=location_filter, top_k=top_k)

    return retrieved_records


def get_local_historical_matches(
    query_text: str, 
    location_filter: Optional[str] = None, 
    top_k: int = 3
) -> List[Dict[str, Any]]:
    lower_query = query_text.lower()
    scored = []
    for ticket in SEED_HISTORICAL_TICKETS:
        if location_filter and not location_matches(location_filter, ticket["location"], ticket.get("building", "")):
            continue

        score = 0.0
        combined = f"{ticket['title']} {ticket['category']} {ticket['location']} {ticket['description']}".lower()
        for w in lower_query.split():
            if len(w) > 3 and w in combined:
                score += 0.25
        if ticket["category"].lower() in lower_query:
            score += 0.4
        
        if score > 0:
            scored.append((score, ticket))
    
    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored[:top_k]]


def upsert_ticket_to_pinecone(ticket_data: Dict[str, Any], complaint: str):
    if not (PINECONE_AVAILABLE and PINECONE_API_KEY):
        return

    try:
        pc = Pinecone(api_key=PINECONE_API_KEY)
        index = pc.Index(PINECONE_INDEX_NAME)
        
        full_text = (
            f"Ticket: {ticket_data.get('title', '')} | "
            f"Complaint: {complaint} | "
            f"Category: {ticket_data.get('category', '')} | "
            f"Location: {ticket_data.get('location', '')} | "
            f"Diagnosis: {ticket_data.get('description', '')} | "
            f"FixApplied: {ticket_data.get('fixApplied', 'Pending')}"
        )
        vector = get_embedding(full_text)
        loc_str = ticket_data.get("location", "")
        loc_entity = extract_location_entity(loc_str) or extract_location_entity(complaint) or loc_str

        index.upsert(vectors=[{
            "id": ticket_data.get("id", f"TICK-{int(time.time())}"),
            "values": vector,
            "metadata": {
                "ticketId": ticket_data.get("id", ""),
                "title": ticket_data.get("title", ""),
                "category": ticket_data.get("category", ""),
                "urgency": ticket_data.get("urgency", "Routine"),
                "priorityScore": ticket_data.get("priorityScore", 50),
                "location": loc_str,
                "building": loc_entity.lower().strip() if loc_entity else "campus",
                "description": ticket_data.get("description", ""),
                "assignedTo": ticket_data.get("assignedTo", ""),
                "rootCause": ticket_data.get("rootCause", "Under investigation"),
                "fixApplied": ticket_data.get("fixApplied", "Pending technician resolution"),
                "isRecurring": ticket_data.get("isRecurring", False),
                "isHazard": ticket_data.get("isHazard", False),
                "createdAt": ticket_data.get("createdAt", time.strftime("%Y-%m-%dT%H:%M:%SZ"))
            }
        }])
    except Exception as e:
        print(f"[Pinecone Upsert Warning]: {e}")


# ==============================================================================
# MULTI-FACTOR PRIORITY SCORING ENGINE (0 - 100)
# ==============================================================================
def compute_priority_metrics(
    category: str,
    complaint: str,
    location: str,
    is_hazard: bool,
    is_recurring: bool,
    weather: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Calculates a deterministic 0-100 Priority Score combining:
    1. Base Severity & Safety Hazard (0-40)
    2. Live Climate / Weather Impact (0-25)
    3. Facility Criticality (0-20)
    4. Verified Equipment Recurrence (0-15)
    """
    lower_comp = complaint.lower()
    lower_loc = location.lower()
    temp = weather.get("temperatureC", 28.0)
    precip = weather.get("precipitationMm", 0.0)
    humidity = weather.get("humidityPercent", 55)

    # 1. Base Severity (0-40)
    base_score = 15
    if is_hazard or any(w in lower_comp for w in ["spark", "fire", "smoke", "burst", "flood", "shock", "exposed wire"]):
        base_score = 40
    elif any(w in lower_comp for w in ["dead", "not working", "broken", "leak", "tripped", "outage"]):
        base_score = 25

    # 2. Climate & Weather Multiplier (0-25)
    weather_score = 0
    weather_reason = "Neutral weather impact"
    if category == "HVAC":
        if temp >= 35.0:
            weather_score = 25
            weather_reason = f"Critical cooling demand during high ambient heat ({temp}°C)"
        elif temp >= 30.0 or humidity >= 75:
            weather_score = 18
            weather_reason = f"Elevated thermal/humidity stress ({temp}°C, {humidity}% RH)"
        elif temp <= 12.0:
            weather_score = 20
            weather_reason = f"Heating critical during low ambient temp ({temp}°C)"
    elif category in ["Plumbing", "General"] and precip > 0.5:
        if any(w in lower_comp for w in ["roof", "drain", "ceiling", "seepage", "window", "flood"]):
            weather_score = 22
            weather_reason = f"Active precipitation ({precip} mm) worsening water ingress"
    elif category == "Electrical" and (precip > 0.5 or humidity >= 80):
        weather_score = 15
        weather_reason = f"High moisture/humidity risk for electrical fault ({humidity}% RH)"

    # 3. Facility & Location Criticality (0-20)
    crit_score = 8
    if any(k in lower_loc for k in ["server", "data", "lab", "medical", "clinic", "main panel"]):
        crit_score = 20
    elif any(k in lower_loc for k in ["library", "cafeteria", "study hall", "auditorium", "lecture"]):
        crit_score = 14

    # 4. Recurrence Bonus (0-15)
    rec_score = 15 if is_recurring else 0

    total_score = min(100, base_score + weather_score + crit_score + rec_score)

    if total_score >= 80:
        tier = "Emergency"
    elif total_score >= 55:
        tier = "Urgent"
    else:
        tier = "Routine"

    return {
        "priorityScore": total_score,
        "urgencyTier": tier,
        "weatherImpactReason": weather_reason,
        "scoreBreakdown": {
            "baseSeverity": base_score,
            "weatherMultiplier": weather_score,
            "locationCriticality": crit_score,
            "recurrenceBonus": rec_score
        }
    }


# ==============================================================================
# AIRTABLE DATABASE SYNC (CREATE & LIFECYCLE UPDATES)
# ==============================================================================
def save_ticket_to_airtable(ticket_data: Dict[str, Any]) -> Optional[str]:
    if not AIRTABLE_API_KEY:
        return None

    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_NAME}"
    payload = {
        "records": [{
            "fields": {
                "Title": ticket_data.get("title", "Maintenance Work Order"),
                "Category": ticket_data.get("category", "General"),
                "Urgency": ticket_data.get("urgency", "Routine"),
                "PriorityScore": ticket_data.get("priorityScore", 50),
                "Location": ticket_data.get("location", "Campus Facility"),
                "Description": ticket_data.get("description", ""),
                "Status": ticket_data.get("status", "Assigned"),
                "AssignedTo": ticket_data.get("assignedTo", "General Maintenance"),
                "TechConfirmed": "false",
                "UserConfirmed": "false",
                "TechFeedback": ""
            }
        }]
    }

    headers = {
        "Authorization": f"Bearer {AIRTABLE_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=8) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            records = res_data.get("records", [])
            return records[0].get("id") if records else None
    except Exception as e:
        print(f"[Airtable Create Warning]: {e}")
        return None


def handle_ticket_lifecycle_update(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handles Dual-Approval Closure & Technician Feedback:
    - Role 'technician': Logs repair feedback, root cause, sets techConfirmed=True,
      and transitions status to 'Pending User Verification'. Also upserts fix to Pinecone!
    - Role 'user': Sets userConfirmed=True. Ticket ONLY becomes 'Completed' when
      BOTH techConfirmed and userConfirmed are True.
    """
    ticket_id = body.get("ticketId")
    airtable_id = body.get("airtableId")
    role = body.get("role", "").lower()
    feedback = body.get("feedback", "").strip()
    root_cause = body.get("rootCause", "Component wear").strip()
    current_ticket = body.get("currentTicket", {})

    tech_confirmed = bool(current_ticket.get("techConfirmed", False))
    user_confirmed = bool(current_ticket.get("userConfirmed", False))
    saved_feedback = current_ticket.get("techFeedback", "")

    if role == "technician":
        tech_confirmed = True
        if feedback:
            saved_feedback = feedback
    elif role == "user":
        user_confirmed = True

    # Enforce Strict Dual-Approval Gate
    if tech_confirmed and user_confirmed:
        new_status = "Completed"
    elif tech_confirmed and not user_confirmed:
        new_status = "Pending User Verification"
    else:
        new_status = current_ticket.get("status", "In Progress")

    # Sync with Airtable if record ID is present
    if AIRTABLE_API_KEY and airtable_id:
        url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_NAME}/{airtable_id}"
        patch_payload = {
            "fields": {
                "TechConfirmed": "true" if tech_confirmed else "false",
                "UserConfirmed": "true" if user_confirmed else "false",
                "Status": new_status,
                "TechFeedback": saved_feedback
            }
        }
        headers = {
            "Authorization": f"Bearer {AIRTABLE_API_KEY}",
            "Content-Type": "application/json"
        }
        try:
            req = urllib.request.Request(url, data=json.dumps(patch_payload).encode("utf-8"), headers=headers, method="PATCH")
            urllib.request.urlopen(req, timeout=8)
        except Exception as e:
            print(f"[Airtable Patch Warning]: {e}")

    # Enrich Vector Knowledge Base when Technician submits repair feedback
    if role == "technician" and saved_feedback:
        enriched_record = {
            **current_ticket,
            "id": ticket_id or current_ticket.get("id", f"TICK-{int(time.time())}"),
            "fixApplied": saved_feedback,
            "rootCause": root_cause,
            "resolvedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        upsert_ticket_to_pinecone(enriched_record, current_ticket.get("description", ""))

    return {
        "ticketId": ticket_id,
        "status": new_status,
        "techConfirmed": tech_confirmed,
        "userConfirmed": user_confirmed,
        "techFeedback": saved_feedback,
        "dualApprovalComplete": (tech_confirmed and user_confirmed)
    }


# ==============================================================================
# CORE RAG WORKFLOW: WEATHER + HISTORY + GEMINI 1.5 FLASH
# ==============================================================================
def run_rag_multimodal_analysis(
    complaint: str,
    image_bytes: Optional[bytes],
    mime_type: str = "image/jpeg",
    reporter_info: Optional[Dict[str, Any]] = None,
    client_weather: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    # 1. Extract location entity & fetch live weather
    extracted_loc = extract_location_entity(complaint)
    weather_ctx = client_weather or get_live_weather_context()

    # 2. Query Pinecone Vector Store for device & location history
    historical_matches = query_pinecone_vector_store(complaint, location_filter=extracted_loc, top_k=3)

    # Verify strict location match
    verified_history = []
    if historical_matches and extracted_loc:
        for h in historical_matches:
            if location_matches(extracted_loc, h.get("location", ""), h.get("building", "")):
                verified_history.append(h)

    history_formatted_list = []
    for idx, match in enumerate(verified_history, 1):
        history_formatted_list.append(
            f"PAST RECORD #{idx} (Ticket {match.get('id')}):\n"
            f"- Device/Location: {match.get('location')} ({match.get('deviceTag', 'N/A')})\n"
            f"- Past Issue: {match.get('description')}\n"
            f"- Root Cause: {match.get('rootCause')}\n"
            f"- Technician Fix Applied: {match.get('fixApplied')}\n"
            f"- Date Resolved: {match.get('resolvedAt')}\n"
        )
    historical_context_str = "\n".join(history_formatted_list) if history_formatted_list else "No prior recorded faults for this specific room/device."

    # 3. Build Weather + RAG System Prompt
    system_instructions = (
        "You are the Chief AI Dispatch Engineer for FixFlow AI.\n"
        "Analyze the maintenance complaint, attached equipment photo, LIVE WEATHER conditions, and PAST DEVICE RECORDS.\n\n"
        f"=== LIVE CAMPUS WEATHER & CLIMATE ===\n"
        f"- Temperature: {weather_ctx['temperatureC']}°C | Humidity: {weather_ctx['humidityPercent']}% | Precipitation: {weather_ctx['precipitationMm']} mm\n"
        f"- Condition Summary: {weather_ctx['conditionSummary']}\n\n"
        f"=== VERIFIED PAST DEVICE RECORDS (FOR TECHNICIAN DOSSIER) ===\n"
        f"{historical_context_str}\n\n"
        f"=== USER COMPLAINT ===\n"
        f"\"{complaint}\"\n\n"
        "=== TRIAGE & PRIORITIZATION RULES ===\n"
        "1. LOCATION INTEGRITY: Use the exact location mentioned by the user unless a verified historical record above matches the same room/building.\n"
        "2. CLIMATE-AWARE URGENCY: Factor live weather into urgency. (e.g., AC failure in >32°C heat or roof/window leak in active rain must be escalated).\n"
        "3. TECHNICIAN ROUTING:\n"
        "   - Electrical -> 'Electrical Tech'\n"
        "   - Plumbing -> 'Plumbing Tech'\n"
        "   - HVAC -> 'HVAC Specialist'\n"
        "   - Other -> 'General Maintenance'\n"
        "4. VISUAL-TEXTUAL CROSS-VERIFICATION (STRICT ANTI-SPAM GATE):\n"
        "   - First, describe in 'detectedVisualObjects' exactly what is physically visible in the image.\n"
        "   - Compare detectedVisualObjects against the user complaint. If the user reports a plumbing/electrical/HVAC fault but the image shows a drawing, sketch, person, notebook, selfie, or unrelated object, you MUST set imageMatchesComplaint: false and set imageValidationWarning to: \"Visual Mismatch: You reported [complaint], but the uploaded photo appears to show [detectedVisualObjects]. Please upload a real photo of the maintenance issue.\"\n"
        "   - If the image plausibly shows the faulty equipment, facility area, or symptom described, set imageMatchesComplaint: true and imageValidationWarning: null.\n\n"
        "Return ONLY valid JSON matching this schema:\n"
        "{\n"
        "  \"detectedVisualObjects\": \"Detailed physical description of what is visible in the photo\",\n"
        "  \"imageMatchesComplaint\": false,\n"
        "  \"imageValidationWarning\": \"Visual Mismatch: You reported [complaint], but the uploaded photo appears to show [detectedVisualObjects]. Please upload a real photo of the maintenance issue.\",\n"
        "  \"title\": \"Concise technical title\",\n"
        "  \"category\": \"Plumbing | Electrical | HVAC | IT | General\",\n"
        "  \"urgency\": \"Emergency | Urgent | Routine\",\n"
        "  \"location\": \"Specific room/building location\",\n"
        "  \"description\": \"Engineering diagnosis incorporating weather stress and past device repair context\",\n"
        "  \"isRecurring\": false,\n"
        "  \"recurringFixSummary\": \"Brief summary of past fixes on this unit for the technician, or null\",\n"
        "  \"assignedTo\": \"Electrical Tech | Plumbing Tech | HVAC Specialist | General Maintenance\",\n"
        "  \"isHazard\": false,\n"
        "  \"safetyPrecautions\": \"Required PPE and isolation steps\"\n"
        "}"
    )

    ticket_data = None
    if GOOGLE_GENAI_AVAILABLE and GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel(MULTIMODAL_MODEL)
            contents = []
            if image_bytes:
                contents.append({"mime_type": mime_type, "data": image_bytes})
            contents.append(system_instructions)

            response = model.generate_content(
                contents,
                generation_config=genai.types.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.2
                )
            )
            raw_text = re.sub(r"^```json\s*|\s*```$", "", response.text.strip()).strip()
            ticket_data = json.loads(raw_text)
        except Exception as e:
            print(f"[Gemini Error]: {e}. Using fallback engine.")

    # Intercept mismatched/random photos before saving to Airtable or Pinecone
    if ticket_data and ticket_data.get("imageMatchesComplaint") is False:
        detected = ticket_data.get("detectedVisualObjects", "an unrelated object or drawing")
        warning_msg = ticket_data.get(
            "imageValidationWarning",
            f"Visual Mismatch: You reported '{complaint}', but the uploaded photo appears to show {detected}. Please upload a real photo of the maintenance issue."
        )
        return {
            "rejected": True,
            "imageMatchesComplaint": False,
            "detectedVisualObjects": detected,
            "warningMessage": warning_msg
        }

    if not ticket_data:
        # DO NOT silently fall back to fallback_triage and auto-approve tickets if vision validation fails!
        print("[Gemini Error]: Vision validation failed or Gemini returned empty response. Rejecting submission.")
        return {
            "rejected": True,
            "imageMatchesComplaint": False,
            "warningMessage": "Vision Validation Error: Unable to verify the uploaded photo with multimodal AI. Please upload a clear photo of the faulty equipment."
        }

    # Enforce strict location accuracy if no verified history matched
    if not verified_history and extracted_loc:
        ticket_data["location"] = extracted_loc
        ticket_data["isRecurring"] = False

    # 4. Run Deterministic Multi-Factor Priority Scoring Engine (0-100)
    is_rec = bool(verified_history) or bool(ticket_data.get("isRecurring", False))
    priority_metrics = compute_priority_metrics(
        category=ticket_data.get("category", "General"),
        complaint=complaint,
        location=ticket_data.get("location", ""),
        is_hazard=bool(ticket_data.get("isHazard", False)),
        is_recurring=is_rec,
        weather=weather_ctx
    )

    ticket_data["priorityScore"] = priority_metrics["priorityScore"]
    ticket_data["urgency"] = priority_metrics["urgencyTier"]
    ticket_data["priority"] = priority_metrics["urgencyTier"]
    ticket_data["priorityBreakdown"] = priority_metrics["scoreBreakdown"]
    ticket_data["weatherContext"] = weather_ctx

    # 5. Attach Past Device Records Dossier for the Field Technician Dashboard
    ticket_data["deviceHistoryLog"] = [
        {
            "ticketId": h.get("id"),
            "deviceTag": h.get("deviceTag", "UNIT-01"),
            "pastIssue": h.get("description"),
            "rootCause": h.get("rootCause"),
            "fixApplied": h.get("fixApplied"),
            "resolvedAt": h.get("resolvedAt")
        }
        for h in verified_history
    ]

    # 6. Initialize Dual-Approval Lifecycle Flags
    ticket_data["id"] = f"TICK-{int(time.time() % 100000):05d}"
    ticket_data["createdAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    ticket_data["status"] = "Assigned"
    ticket_data["techConfirmed"] = False
    ticket_data["userConfirmed"] = False
    ticket_data["techFeedback"] = ""
    ticket_data["reportedBy"] = reporter_info or {"id": "usr_campus", "name": "Campus User", "role": "user"}

    # 7. Sync with Airtable & Pinecone
    airtable_id = save_ticket_to_airtable(ticket_data)
    if airtable_id:
        ticket_data["airtableId"] = airtable_id

    upsert_ticket_to_pinecone(ticket_data, complaint)
    return ticket_data


def fallback_triage(
    complaint: str, 
    verified_history: List[Dict[str, Any]], 
    location_entity: Optional[str] = None
) -> Dict[str, Any]:
    lower = complaint.lower()
    cat = "General"
    assigned = "General Maintenance"
    is_hazard = False
    loc = location_entity if location_entity else "Campus Main Facility"

    if any(k in lower for k in ["water", "pipe", "leak", "sink", "faucet", "flood", "plumb"]):
        cat = "Plumbing"
        assigned = "Plumbing Tech"
    elif any(k in lower for k in ["electric", "wire", "breaker", "spark", "panel", "voltage"]):
        cat = "Electrical"
        assigned = "Electrical Tech"
        is_hazard = True
    elif any(k in lower for k in ["ac", "hvac", "chiller", "cooling", "heat", "air"]):
        cat = "HVAC"
        assigned = "HVAC Specialist"

    is_recurring = len(verified_history) > 0
    past_fix = f"Past Ticket {verified_history[0]['id']}: {verified_history[0].get('fixApplied')}" if is_recurring else None

    return {
        "title": complaint[:50].strip(),
        "category": cat,
        "location": loc,
        "description": f"Reported fault: {complaint.strip()}",
        "imageMatchesComplaint": True,
        "imageValidationWarning": None,
        "isRecurring": is_recurring,
        "recurringFixSummary": past_fix,
        "assignedTo": assigned,
        "isHazard": is_hazard,
        "safetyPrecautions": "Isolate utilities before repair." if is_hazard else "Standard PPE."
    }


# ==============================================================================
# AWS LAMBDA ENTRY POINT
# ==============================================================================
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    cors_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
    }

    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method.upper() == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": json.dumps({"status": "OK"})}

    try:
        raw_body = event.get("body", "{}")
        if event.get("isBase64Encoded", False):
            raw_body = base64.b64decode(raw_body).decode("utf-8")
        body = json.loads(raw_body or "{}") if isinstance(raw_body, str) else raw_body

        action = body.get("action", "create_ticket")

        # ROUTE 1: Dual-Approval Closure & Technician Feedback Update
        if action == "update_closure" or http_method.upper() == "PATCH":
            updated_state = handle_ticket_lifecycle_update(body)
            return {
                "statusCode": 200,
                "headers": cors_headers,
                "body": json.dumps({
                    "success": True,
                    "lifecycle": updated_state,
                    "message": "Ticket lifecycle and feedback updated."
                })
            }

        # ROUTE 2: New Ticket Creation via Weather-Aware RAG Pipeline
        complaint = body.get("complaint", "").strip()
        if not complaint:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "Missing 'complaint' field."})
            }

        image_bytes = None
        mime_type = body.get("mimeType", "image/jpeg")
        image_data = body.get("image") or body.get("photo")
        if image_data:
            if "," in image_data:
                header, encoded = image_data.split(",", 1)
                match = re.search(r"data:([^;]+);base64", header)
                if match:
                    mime_type = match.group(1)
                image_bytes = base64.b64decode(encoded)
            else:
                image_bytes = base64.b64decode(image_data)

        # Enforce Mandatory Image Check in lambda_handler:
        if not image_bytes:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({
                    "success": False,
                    "warning": True,
                    "error": "Missing Visual Evidence",
                    "message": "Warning: Please attach or capture a clear photo of the faulty equipment before submitting."
                })
            }

        ticket_result = run_rag_multimodal_analysis(
            complaint=complaint,
            image_bytes=image_bytes,
            mime_type=mime_type,
            reporter_info=body.get("reporter"),
            client_weather=body.get("weather")
        )

        # Block Mismatched Submissions with HTTP 422
        if ticket_result.get("rejected"):
            return {
                "statusCode": 422,
                "headers": cors_headers,
                "body": json.dumps({
                    "success": False,
                    "warning": True,
                    "imageMatchesComplaint": False,
                    "message": ticket_result.get("warningMessage")
                })
            }

        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({
                "success": True,
                "ticket": ticket_result
            })
        }

    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": "Internal Server Error", "message": str(exc)})
        }
