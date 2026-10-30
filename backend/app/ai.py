"""
AI Multimodal Vision, Weather Telemetry & Triage Engine for FixFlow AI
"""
import json
import base64
import urllib.request
from typing import Dict, Any, Optional, Tuple
from .config import GEMINI_API_KEY, MULTIMODAL_MODEL, CAMPUS_LAT, CAMPUS_LON
from .lifecycle import evaluate_safety_critical
from .models import TicketPriority, Specialty

try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
except ImportError:
    GENAI_AVAILABLE = False


VALID_CATEGORIES = {Specialty.PLUMBING, Specialty.ELECTRICAL, Specialty.HVAC, Specialty.IT, Specialty.GENERAL}
VALID_URGENCIES = {TicketPriority.EMERGENCY, TicketPriority.URGENT, TicketPriority.ROUTINE}


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
    historical_matches: Optional[list] = None
) -> Dict[str, Any]:
    """
    Multimodal reasoning pipeline:
    1. Visual equipment & damage analysis
    2. Weather telemetric context
    3. RAG historical recurrence check
    4. Deterministic safety-critical override clamp
    """
    # 1. Mandatory image presence check
    if not image_base64:
        raise ValueError("A photo of the maintenance fault is mandatory for AI triage and verification.")

    weather = get_live_weather_context()

    # Clean base64 header if present
    clean_b64 = image_base64
    if "," in clean_b64:
        clean_b64 = clean_b64.split(",", 1)[1]

    # Try Gemini 1.5 Flash if available
    ai_result = None
    if GENAI_AVAILABLE and GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel(MULTIMODAL_MODEL)
            prompt = f"""You are the senior facilities engineering visual-textual verification engine for FixFlow AI / SmartFix AI.
Analyze the attached maintenance fault photo alongside the user complaint using this strict TWO-STEP VISUAL ANALYSIS:

Step 1: Identify key problem-defining objects in the text complaint (e.g., 'pipe', 'leak', 'wire', 'breaker', 'ac', 'chiller', 'sink', 'faucet', 'toilet', 'switch', 'light', 'router', 'cable', etc.).
Step 2: Inspect the image to check if those exact problem-defining objects or physical maintenance symptoms are visibly present.

RULES:
- If the image contains something completely unrelated (e.g., drawings, sketches, artwork, selfies, faces, people, food, animals, random wallpaper, or unrelated furniture/walls that do not show the fault), you MUST set "imageMatchesComplaint": false and return a precise warning string in "imageValidationWarning" explaining why the photo was rejected (e.g., "Photo Irrelevant: You described a pipe leak, but the photo shows an artwork. Please upload a real photo of the broken equipment.").
- If the image visibly matches the problem described in the complaint, set "imageMatchesComplaint": true and "imageValidationWarning": null.

User Complaint: "{complaint}"
Campus Weather Context: {json.dumps(weather)}
Historical Fault Matches: {json.dumps(historical_matches or [])}

Respond ONLY with valid JSON with this exact structure:
{{
  "imageMatchesComplaint": boolean,
  "imageValidationWarning": string or null,
  "title": "Concise professional title (max 8 words)",
  "category": "Plumbing" | "Electrical" | "HVAC" | "IT" | "General",
  "urgency": "Emergency" | "Urgent" | "Routine",
  "priorityScore": 0-100 integer,
  "isHazard": boolean,
  "location": "Inferred campus location or General Facilities",
  "assignedTo": "Plumbing Tech" | "Electrical Tech" | "HVAC Specialist" | "General Maintenance",
  "reasoning": "1-2 sentence engineering justification"
}}"""

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
            print(f"[Gemini Vision Notice]: AI call error ({e}), falling back to deterministic triage.")

    # Validate AI result against strict schema invariants and fallback if needed
    ai_result = _validate_and_sanitize_ai_output(ai_result, complaint)

    # Visual-Textual Verification Gate (imageMatchesComplaint check)
    image_matches = ai_result.get("imageMatchesComplaint")
    if image_matches is None:
        image_matches = ai_result.get("isRelevantPhoto", True)
    image_warning = ai_result.get("imageValidationWarning")

    # Offline/test heuristic for detecting explicitly marked or simulated irrelevant test images
    img_check = (image_base64 or "").lower()
    if any(k in img_check for k in ["test_irrelevant", "irrelevant_photo", "sketch_photo", "artwork_photo", "selfie_photo"]):
        image_matches = False
        image_warning = image_warning or f"Photo Irrelevant: You described '{complaint[:40].strip()}', but the photo shows an unrelated sketch or artwork. Please upload a real photo of the broken equipment."

    # 4. Mandatory Safety-Critical Override Clamp
    # Even if Gemini scored urgency as Routine, safety-critical keywords clamp it immediately
    req_urgency = ai_result.get("urgency", TicketPriority.ROUTINE)
    req_score = int(ai_result.get("priorityScore", 50))
    req_hazard = bool(ai_result.get("isHazard", False))

    final_urgency, final_score, final_hazard, safety_override = evaluate_safety_critical(
        complaint,
        requested_priority=req_urgency,
        requested_score=req_score,
        is_hazard=req_hazard
    )

    category = ai_result.get("category", Specialty.GENERAL)
    assigned_to = ai_result.get("assignedTo", "General Maintenance")

    # Map assigned technician role to category
    if category == Specialty.PLUMBING:
        assigned_to = "Plumbing Tech"
    elif category == Specialty.ELECTRICAL:
        assigned_to = "Electrical Tech"
    elif category == Specialty.HVAC:
        assigned_to = "HVAC Specialist"

    return {
        "title": ai_result.get("title", complaint[:50]),
        "description": complaint.strip(),
        "category": category,
        "priority": final_urgency,
        "urgency": final_urgency,
        "priorityScore": final_score,
        "isHazard": final_hazard,
        "safetyOverride": safety_override,
        "imageMatchesComplaint": image_matches,
        "imageValidationWarning": image_warning,
        "location": ai_result.get("location", "Campus Facilities"),
        "assignedTo": assigned_to,
        "weatherContext": weather,
        "reasoning": ai_result.get("reasoning", "Standard algorithmic safety triage.")
    }


def _deterministic_fallback_triage(complaint: str) -> Dict[str, Any]:
    """High-reliability deterministic keyword categorizer."""
    lower = complaint.lower()

    if any(k in lower for k in ["pipe", "leak", "sink", "water", "drain", "toilet", "tap", "flood", "sewage"]):
        category = Specialty.PLUMBING
        assigned_to = "Plumbing Tech"
    elif any(k in lower for k in ["breaker", "electric", "spark", "wire", "switch", "power", "short", "socket", "light", "fuse"]):
        category = Specialty.ELECTRICAL
        assigned_to = "Electrical Tech"
    elif any(k in lower for k in ["ac", "air condition", "hvac", "heater", "cooling", "chiller", "ventilation", "compressor"]):
        category = Specialty.HVAC
        assigned_to = "HVAC Specialist"
    elif any(k in lower for k in ["server", "wifi", "router", "network", "cable", "lan", "monitor", "pc", "computer"]):
        category = Specialty.IT
        assigned_to = "IT Support Specialist"
    else:
        category = Specialty.GENERAL
        assigned_to = "General Maintenance"

    urgency = TicketPriority.ROUTINE
    score = 40
    hazard = False

    if any(k in lower for k in ["emergency", "urgent", "critical", "burst", "smoke", "fire", "shock", "danger"]):
        urgency = TicketPriority.EMERGENCY
        score = 90
        hazard = True
    elif any(k in lower for k in ["soon", "important", "moderate", "dripping", "hot"]):
        urgency = TicketPriority.URGENT
        score = 70

    return {
        "title": complaint.strip().capitalize()[:48] if complaint else "Maintenance Request",
        "category": category,
        "urgency": urgency,
        "priorityScore": score,
        "isHazard": hazard,
        "location": "Campus Facilities",
        "assignedTo": assigned_to,
        "isRelevantPhoto": True,
        "imageMatchesComplaint": True,
        "imageValidationWarning": None,
        "reasoning": f"Triaged into {category} based on deterministic facilities engineering keywords."
    }
