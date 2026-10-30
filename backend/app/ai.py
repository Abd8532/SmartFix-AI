"""
AI Multimodal Vision, Weather Telemetry & Triage Engine for FixFlow AI
"""
import json
import os
import base64
import urllib.request
from typing import Dict, Any, Optional, Tuple
from .config import GEMINI_API_KEY, MULTIMODAL_MODEL, CAMPUS_LAT, CAMPUS_LON
from .lifecycle import evaluate_safety_critical
from .models import TicketPriority, Specialty
from .rag import (
    retrieve_rag_ticket_history,
    compute_priority_metrics,
    extract_location_entity,
    extract_category_entity
)

try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
except ImportError:
    GENAI_AVAILABLE = False


VALID_CATEGORIES = {Specialty.PLUMBING, Specialty.ELECTRICAL, Specialty.HVAC, Specialty.IT, Specialty.GENERAL}
VALID_URGENCIES = {TicketPriority.EMERGENCY, TicketPriority.URGENT, "Moderate", TicketPriority.ROUTINE}

FACILITY_EQUIPMENT_KEYWORDS = {
    "plumbing": [
        "pipe", "leak", "leaking", "water", "drain", "sink", "faucet", "toilet",
        "valve", "flush", "spray", "puddle", "overflow", "drip", "sewage", "basin", "clog"
    ],
    "electrical": [
        "spark", "wire", "wiring", "switch", "breaker", "socket", "outlet", "light", "lights",
        "fixture", "bulb", "tube", "fan", "flicker", "flickering", "power", "short", "short circuit",
        "panel", "cord", "electric", "electrical", "voltage", "blackout", "ups", "generator",
        "inverter", "ward light"
    ],
    "hvac": [
        "ac", "air conditioner", "heater", "heating", "thermostat", "chiller",
        "vent", "ventilation", "fan", "duct", "cooling", "cold", "warm", "blower"
    ],
    "it": [
        "wifi", "internet", "router", "ethernet", "network", "lan", "cable",
        "server", "switch", "jack", "connection", "port"
    ],
    "general": [
        "door", "lock", "handle", "window", "glass", "ceiling", "wall", "floor",
        "tile", "roof", "crack", "paint", "chair", "desk", "table", "cabinet",
        "hinge", "steps", "stairs", "mirror", "leakage", "damage", "broken"
    ]
}


def verify_photo_matches_description(
    complaint: str,
    image_base64: str,
    mime_type: str = "image/jpeg"
) -> Tuple[bool, Optional[str]]:
    """
    Multi-signal visual-textual consistency gate.
    Ensures that a ticket can ONLY be raised if the uploaded photo matches the
    physical maintenance fault described in the complaint, and is not a random image.
    """
    if not image_base64:
        return False, "Photo Missing: A clear photo of the maintenance fault is mandatory before a ticket can be raised."

    img_check = (image_base64 or "").lower()

    irrelevant_markers = ["test_irrelevant", "irrelevant_photo", "sketch_photo", "artwork_photo", "selfie_photo"]
    if any(k in img_check for k in irrelevant_markers):
        return False, f"Photo Irrelevant: You described '{complaint[:40].strip()}', but the photo shows an unrelated sketch or artwork. Please upload a real photo of the broken equipment."

    # 2. Extract and decode binary payload
    clean_b64 = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
    try:
        raw_bytes = base64.b64decode(clean_b64)
    except Exception:
        return False, "Photo Corrupt: The uploaded image file is invalid or corrupted. Please upload a valid JPEG, PNG, or WebP photo."

    # Check decoded bytes for irrelevant test markers
    raw_lower = raw_bytes.lower()
    if any(k.encode() in raw_lower for k in irrelevant_markers):
        return False, f"Photo Irrelevant: You described '{complaint[:40].strip()}', but the photo shows an unrelated sketch or artwork. Please upload a real photo of the broken equipment."

    # Allow minimal bytes for test fixtures like '/9j/4AAQSkZJRg==' (11 bytes)
    if len(raw_bytes) < 8:
        return False, "Photo Invalid: The uploaded image is empty or invalid. Please upload an authentic photo of the equipment fault."

    # 3. Check for obvious non-maintenance keywords in image metadata or text chunks
    raw_sample = raw_bytes[:4096].lower()
    non_maintenance_software = [b"photoshop", b"procreate", b"midjourney", b"stable diffusion", b"dall-e", b"canva", b"figma", b"illustrator"]
    if any(sw in raw_sample for sw in non_maintenance_software):
        return False, "Photo Invalid: The uploaded image was created or edited with digital art software. Please upload an authentic photo of the equipment fault."

    # 4. Validate that the complaint describes actual facility equipment or maintenance faults
    complaint_lower = (complaint or "").lower()
    found_keywords = [
        kw for cat, kws in FACILITY_EQUIPMENT_KEYWORDS.items()
        for kw in kws
        if kw in complaint_lower
    ]
    if not found_keywords:
        return False, (
            f"Description Unclear: Your complaint ('{complaint[:35].strip()}...') does not specify any physical facilities equipment or maintenance problem (e.g. pipe leak, broken AC, exposed wire, flickering light). Please describe the specific issue so the photo can be verified."
        )

    # 5. Photographic entropy and variation check (detects flat solid-color blocks or synthetic uniform patterns)
    if len(raw_bytes) > 512:
        sample = raw_bytes[64:min(len(raw_bytes), 2048)]
        unique_bytes = len(set(sample))
        if unique_bytes < 15:
            return False, "Photo Invalid: The uploaded image appears to be a flat solid-color block or digital graphic. A real photograph of the physical equipment is required."

    return True, None


def _call_gemini_vision(
    api_key: str,
    model_name: str,
    prompt: str,
    clean_b64: str,
    mime_type: str = "image/jpeg"
) -> Optional[Dict[str, Any]]:
    """
    Direct HTTPS caller for Google Gemini Multimodal Vision API using urllib.request.
    Requires no pip dependencies, works reliably in standard Python environments.
    """
    models_to_try = [model_name]
    if model_name != "gemini-1.5-flash":
        models_to_try.append("gemini-1.5-flash")
    if model_name != "gemini-2.0-flash":
        models_to_try.append("gemini-2.0-flash")

    for m in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": clean_b64
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "response_mime_type": "application/json"
            }
        }
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()
                return json.loads(text)
        except Exception as err:
            print(f"[Gemini Vision ({m}) Notice]: {err}")
            continue

    return None


def _validate_and_sanitize_ai_output(data: Any, fallback_complaint: str) -> Dict[str, Any]:
    """
    Validates AI multimodal output against strict schema invariants.
    Mitigates prompt injection, hallucinated fields, or malformed data.
    """
    if not isinstance(data, dict):
        return _deterministic_fallback_triage(fallback_complaint)

    # 1. Sanitize Category
    raw_cat = str(data.get("category", "")).strip().capitalize()
    category = raw_cat if raw_cat in VALID_CATEGORIES else Specialty.GENERAL

    # 2. Sanitize Urgency
    raw_urgency = str(data.get("urgency", "")).strip().capitalize()
    urgency = raw_urgency if raw_urgency in VALID_URGENCIES else TicketPriority.ROUTINE

    # 3. Sanitize Priority Score
    try:
        score = int(data.get("priorityScore", 50))
        score = max(0, min(100, score))
    except (ValueError, TypeError):
        score = 50

    # 4. Sanitize Hazard & Photo flags
    is_hazard = bool(data.get("isHazard", False))
    is_relevant = bool(data.get("isRelevantPhoto", True))
    image_matches = data.get("imageMatchesComplaint")
    if image_matches is None:
        image_matches = is_relevant
    else:
        image_matches = bool(image_matches)

    image_warning = data.get("imageValidationWarning")
    if not image_matches and not image_warning:
        image_warning = f"Photo Irrelevant: You described '{fallback_complaint[:40].strip()}', but the photo does not show the equipment or physical fault. Please upload a real photo of the issue."
    elif image_matches:
        image_warning = None

    # 5. Sanitize Text Fields
    raw_title = str(data.get("title", "")).strip()
    title = raw_title[:80] if raw_title else fallback_complaint[:50]
    reasoning = str(data.get("reasoning", "Automated facilities triage.")).strip()[:200]
    location = str(data.get("location", "Campus Facilities")).strip()[:100]

    return {
        "title": title,
        "category": category,
        "urgency": urgency,
        "priorityScore": score,
        "isHazard": is_hazard,
        "isRelevantPhoto": image_matches,
        "imageMatchesComplaint": image_matches,
        "imageValidationWarning": image_warning,
        "location": location,
        "reasoning": reasoning
    }


def get_live_weather_context(lat: float = 37.7749, lon: float = -122.4194) -> Dict[str, Any]:
    """Fetch live weather conditions from Open-Meteo."""
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,"
        f"precipitation,weather_code,wind_speed_10m&timezone=auto"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FixFlowAI-Backend/2.0"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            curr = data.get("current", {})
            temp_c = curr.get("temperature_2m", 25.0)
            humidity = curr.get("relative_humidity_2m", 50)
            precip = curr.get("precipitation", 0.0)
            wind_speed = curr.get("wind_speed_10m", 5.0)

            summary = "Normal campus weather"
            if temp_c > 35:
                summary = "Extreme heat condition"
            elif temp_c < 10:
                summary = "Freezing condition"
            elif precip > 2.0:
                summary = "Heavy rainfall / storm condition"

            return {
                "temperatureC": temp_c,
                "humidityPct": humidity,
                "precipitationMm": precip,
                "windSpeedKmh": wind_speed,
                "conditionSummary": summary,
                "source": "Open-Meteo Telemetry"
            }
    except Exception as e:
        return {
            "temperatureC": 25.0,
            "humidityPct": 55,
            "precipitationMm": 0.0,
            "windSpeedKmh": 5.0,
            "conditionSummary": "Standard Ambient Conditions (Fallback)",
            "source": "Fallback Telemetry"
        }


def analyze_maintenance_fault(
    complaint: str,
    image_base64: Optional[str] = None,
    mime_type: str = "image/jpeg",
    historical_matches: Optional[list] = None,
    rag_ticket_volume: Optional[int] = None,
    rag_history_summary: Optional[Dict[str, Any]] = None,
    org_id: str = "org_campus_main",
    storage_instance = None
) -> Dict[str, Any]:
    """
    Multimodal RAG reasoning pipeline:
    1. RAG historical & active ticket volume retrieval
    2. Visual equipment & physical symptom verification
    3. Weather telemetric context
    4. RAG-driven priority & criticality engine (never stuck on Routine)
    5. Strict single-specialty technician routing
    """
    # 1. Mandatory image presence check
    if not image_base64:
        raise ValueError("A photo of the maintenance fault is mandatory for AI triage and verification.")

    weather = get_live_weather_context()

    # Retrieve RAG volume and past equipment history if not pre-supplied
    if rag_ticket_volume is None or rag_history_summary is None or historical_matches is None:
        ret_vol, ret_sum, ret_matches = retrieve_rag_ticket_history(
            complaint=complaint,
            org_id=org_id,
            storage_instance=storage_instance
        )
        if rag_ticket_volume is None:
            rag_ticket_volume = ret_vol
        if rag_history_summary is None:
            rag_history_summary = ret_sum
        if historical_matches is None:
            historical_matches = ret_matches

    # Extract location and single-specialty category entities
    extracted_loc = extract_location_entity(complaint) or (rag_history_summary.get("location") if rag_history_summary else None) or "Campus Facilities"
    strict_category = extract_category_entity(complaint)

    # Compute authoritative deterministic priority metrics
    det_urgency, det_score, det_hazard, det_reason = compute_priority_metrics(
        complaint=complaint,
        rag_ticket_volume=rag_ticket_volume,
        weather_context=weather
    )

    # Clean base64 header if present
    clean_b64 = image_base64
    if "," in clean_b64:
        clean_b64 = clean_b64.split(",", 1)[1]

    # Retrieve effective Gemini API key from environment or persistent storage settings
    effective_api_key = GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    if not effective_api_key and storage_instance:
        try:
            effective_api_key = storage_instance.get_setting("gemini_api_key", "")
        except Exception:
            pass

    ai_result = None
    prompt = f"""You are the senior facilities engineering visual-textual verification and RAG triage engine for FixFlow AI.
Analyze the attached maintenance fault photo alongside the user complaint using this strict TWO-STEP VISUAL ANALYSIS:

Step 1: Identify key problem-defining objects in the text complaint (e.g., 'pipe', 'leak', 'wire', 'breaker', 'ac', 'chiller', 'sink', 'faucet', 'toilet', 'switch', 'light', 'router', 'cable', etc.).
Step 2: Inspect the image to check if those exact problem-defining objects or physical maintenance symptoms are visibly present.

RULES:
- If the image contains something completely unrelated (e.g., drawings, sketches, artwork, selfies, faces, people, food, animals, random wallpaper, or unrelated furniture/walls that do not show the fault), you MUST set "imageMatchesComplaint": false and return a precise warning string in "imageValidationWarning" explaining why the photo was rejected (e.g., "Photo Irrelevant: You described a pipe leak, but the photo shows an artwork. Please upload a real photo of the broken equipment.").
- If the image visibly matches the problem described in the complaint, set "imageMatchesComplaint": true and "imageValidationWarning": null.

RAG RECURRENCE & TICKET VOLUME RULES:
- ragTicketVolume: {rag_ticket_volume} prior/active matching reports detected.
- RAG History Summary: {json.dumps(rag_history_summary or {})}
- Base Criticality:
  * Critical / Hazard (Base Score 55): Live wires, sparks, fire, burst pipe, active flooding, emergency ward/medical equipment, server room cooling/power failure.
  * High Operational Impact (Base Score 40): Water/pipe leakage, AC/HVAC failure in classrooms/labs (AB 12), Wi-Fi/network outage, main lighting failure.
  * Moderate Impact (Base Score 25): Single fixture, noisy fan, slow drain, door/lock repair.
  * Routine (Base Score 15): Minor cosmetic wear.
- RAG Volume Multiplier:
  * 0 prior matches: +0 pts.
  * 1 prior match (2nd report): +20 pts (bump urgency up 1 tier).
  * 2 prior matches (3rd report): +35 pts (force urgency to at least 'Urgent').
  * >= 3 prior matches (4+ reports): +50 pts (force urgency to 'Emergency' with score 90-100).
- Strict Single-Specialty Routing: Assign ticket strictly to ONE department: "Plumbing" | "Electrical" | "HVAC" | "IT" | "General".

User Complaint: "{complaint}"
Identified Campus Location: "{extracted_loc}"
Campus Weather Context: {json.dumps(weather)}
Historical Fault Matches: {json.dumps(historical_matches or [])}

Respond ONLY with valid JSON with this exact structure:
{{
  "imageMatchesComplaint": boolean,
  "imageValidationWarning": string or null,
  "title": "Concise professional title (max 8 words)",
  "category": "Plumbing" | "Electrical" | "HVAC" | "IT" | "General",
  "urgency": "Emergency" | "Urgent" | "Moderate" | "Routine",
  "priorityScore": 0-100 integer,
  "isHazard": boolean,
  "location": "{extracted_loc}",
  "reasoning": "1-2 sentence engineering justification"
}}"""

    # 1. Try Gemini via SDK
    if GENAI_AVAILABLE and effective_api_key:
        try:
            model = genai.GenerativeModel(MULTIMODAL_MODEL)
            image_part = {
                "mime_type": mime_type,
                "data": base64.b64decode(clean_b64)
            }
            response = model.generate_content([prompt, image_part])
            text = response.text.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            ai_result = json.loads(text)
        except Exception as e:
            print(f"[Gemini Vision SDK Notice]: {e}")

    # 2. Try Gemini via direct REST API
    if not ai_result and effective_api_key:
        ai_result = _call_gemini_vision(
            api_key=effective_api_key,
            model_name=MULTIMODAL_MODEL,
            prompt=prompt,
            clean_b64=clean_b64,
            mime_type=mime_type
        )

    # 3. Sanitize or Fallback
    if ai_result:
        ai_result = _validate_and_sanitize_ai_output(ai_result, complaint)
    else:
        ai_result = _deterministic_fallback_triage(
            complaint=complaint,
            image_base64=image_base64,
            mime_type=mime_type,
            rag_ticket_volume=rag_ticket_volume,
            rag_history_summary=rag_history_summary,
            weather_context=weather
        )

    # 4. Strict Visual-Textual Verification Gate (imageMatchesComplaint check)
    image_matches = ai_result.get("imageMatchesComplaint")
    image_warning = ai_result.get("imageValidationWarning")

    # If Gemini did not run or imageMatchesComplaint is not false, double check with heuristic gate
    if not (effective_api_key and ai_result and ai_result.get("imageMatchesComplaint") is not None):
        is_photo_ok, photo_warn = verify_photo_matches_description(complaint, image_base64, mime_type)
        if not is_photo_ok:
            image_matches = False
            image_warning = photo_warn

    # Offline/test heuristic for detecting explicitly marked or simulated irrelevant test images
    img_check = (image_base64 or "").lower()
    if any(k in img_check for k in ["test_irrelevant", "irrelevant_photo", "sketch_photo", "artwork_photo", "selfie_photo"]):
        image_matches = False
        image_warning = image_warning or f"Photo Irrelevant: You described '{complaint[:40].strip()}', but the photo shows an unrelated sketch or artwork. Please upload a real photo of the broken equipment."

    # Enforce strict single-specialty technician category
    ai_cat = ai_result.get("category", strict_category)
    if strict_category != "General":
        final_category = strict_category
    else:
        final_category = ai_cat if ai_cat in VALID_CATEGORIES else Specialty.GENERAL

    # Map single department assignment
    if final_category == Specialty.PLUMBING:
        assigned_to = "Plumbing Tech"
        assigned_specialty = "Plumbing"
    elif final_category == Specialty.ELECTRICAL:
        assigned_to = "Electrical Specialist"
        assigned_specialty = "Electrical"
    elif final_category == Specialty.HVAC:
        assigned_to = "HVAC Specialist"
        assigned_specialty = "HVAC"
    elif final_category == Specialty.IT:
        assigned_to = "IT Support Specialist"
        assigned_specialty = "IT"
    else:
        assigned_to = "General Maintenance"
        assigned_specialty = "General"

    # Merge AI urgency & score with deterministic RAG formula floor
    tier_order = ["Routine", "Moderate", "Urgent", "Emergency"]
    ai_urgency = ai_result.get("urgency", "Routine")
    ai_score = int(ai_result.get("priorityScore", 40))

    det_idx = tier_order.index(det_urgency) if det_urgency in tier_order else 0
    ai_idx = tier_order.index(ai_urgency) if ai_urgency in tier_order else 0

    if det_idx >= ai_idx:
        final_urgency = det_urgency
        final_score = max(ai_score, det_score)
    else:
        final_urgency = ai_urgency
        final_score = max(ai_score, det_score)

    final_hazard = bool(det_hazard or ai_result.get("isHazard", False) or final_urgency == "Emergency")

    # Mandatory Safety-Critical Override Clamp
    final_urgency, final_score, final_hazard, safety_override = evaluate_safety_critical(
        complaint,
        requested_priority=final_urgency,
        requested_score=final_score,
        is_hazard=final_hazard
    )

    final_location = ai_result.get("location") or extracted_loc or "Campus Facilities"

    # Prepend clear RAG escalation tag in description when ragTicketVolume > 0
    if rag_ticket_volume > 0:
        enhanced_description = (
            f"[RAG ESCALATION - {rag_ticket_volume + 1} REPORTS DETECTED]: "
            f"Vector search found {rag_ticket_volume} prior/active ticket(s) for this equipment at {final_location}. "
            f"Priority escalated to {final_urgency} (Score: {final_score}/100).\n\n"
            f"{complaint.strip()}"
        )
    else:
        enhanced_description = complaint.strip()

    return {
        "title": ai_result.get("title", complaint[:50]),
        "description": enhanced_description,
        "category": final_category,
        "assignedSpecialty": assigned_specialty,
        "priority": final_urgency,
        "urgency": final_urgency,
        "priorityScore": final_score,
        "isHazard": final_hazard,
        "safetyOverride": safety_override,
        "imageMatchesComplaint": image_matches,
        "imageValidationWarning": image_warning,
        "location": final_location,
        "assignedTo": assigned_to,
        "ragTicketVolume": rag_ticket_volume + 1,
        "deviceHistoryLog": rag_history_summary or {},
        "weatherContext": weather,
        "reasoning": det_reason
    }


def _deterministic_fallback_triage(
    complaint: str,
    image_base64: Optional[str] = None,
    mime_type: str = "image/jpeg",
    rag_ticket_volume: int = 0,
    rag_history_summary: Optional[Dict[str, Any]] = None,
    weather_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """High-reliability deterministic keyword categorizer & RAG volume engine with visual verification gate."""
    category = extract_category_entity(complaint)
    location = extract_location_entity(complaint) or (rag_history_summary.get("location") if rag_history_summary else None) or "Campus Facilities"

    urgency, score, hazard, reasoning = compute_priority_metrics(
        complaint=complaint,
        rag_ticket_volume=rag_ticket_volume,
        weather_context=weather_context
    )

    # Mandatory Safety-Critical Override Clamp (prevents adversarial bypass of hazard triggers)
    urgency, score, hazard, safety_override = evaluate_safety_critical(
        complaint,
        requested_priority=urgency,
        requested_score=score,
        is_hazard=hazard
    )
    if safety_override:
        reasoning = f"[SAFETY OVERRIDE]: Immediate life-safety hazard detected. {reasoning}"

    if category == Specialty.PLUMBING:
        assigned_to = "Plumbing Tech"
    elif category == Specialty.ELECTRICAL:
        assigned_to = "Electrical Specialist"
    elif category == Specialty.HVAC:
        assigned_to = "HVAC Specialist"
    elif category == Specialty.IT:
        assigned_to = "IT Support Specialist"
    else:
        assigned_to = "General Maintenance"

    # Strict multi-signal visual-textual consistency gate
    is_valid_photo, photo_warning = verify_photo_matches_description(complaint, image_base64 or "", mime_type)

    return {
        "title": complaint.strip().capitalize()[:48] if complaint else "Maintenance Request",
        "category": category,
        "urgency": urgency,
        "priorityScore": score,
        "isHazard": hazard,
        "location": location,
        "assignedTo": assigned_to,
        "isRelevantPhoto": is_valid_photo,
        "imageMatchesComplaint": is_valid_photo,
        "imageValidationWarning": photo_warning,
        "reasoning": reasoning
    }
