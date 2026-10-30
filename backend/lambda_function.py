"""
FixFlow AI - AWS Lambda Entrypoint Adapter
Wraps the modular backend application into an AWS API Gateway proxy handler.
Enforces strict visual-textual verification with Gemini 1.5 Flash,
guarantees image persistence across 'image', 'photo', and 'imageUrl',
and passes verified image data straight through to Airtable and frontend responses.
"""
import json
import os
import urllib.request
import urllib.error
from app.api import handle_api_request


def run_rag_multimodal_analysis(
    complaint: str,
    image_base64: str = None,
    mime_type: str = "image/jpeg",
    historical_matches: list = None,
    rag_ticket_volume: int = None,
    rag_history_summary: dict = None,
    org_id: str = "org_campus_main"
) -> dict:
    """
    Multimodal RAG reasoning & visual-textual verification engine for FixFlow AI.
    Executes Gemini 1.5 Flash two-step visual analysis:
      Step 1: Identify key problem-defining objects in the text complaint (e.g. pipe, leak, wire, breaker, ac, chiller, sink).
      Step 2: Inspect the image to check if those exact problem-defining objects or physical symptoms are visibly present.
    If the image contains something completely unrelated (e.g. drawings, artwork, food, faces, animals, or unrelated furniture/walls),
    Gemini sets imageMatchesComplaint: False and returns a precise warning string in imageValidationWarning.
    Calculates RAG historical recurrence volume and strictly escalates priority & routes to department.
    """
    from app.ai import analyze_maintenance_fault
    from app.rag import retrieve_rag_ticket_history

    if rag_ticket_volume is None or rag_history_summary is None or historical_matches is None:
        try:
            vol, summary, matches = retrieve_rag_ticket_history(complaint, org_id=org_id)
            if rag_ticket_volume is None:
                rag_ticket_volume = vol
            if rag_history_summary is None:
                rag_history_summary = summary
            if historical_matches is None:
                historical_matches = matches
        except Exception as e:
            print(f"[RAG Retrieval Notice]: {e}")
            if rag_ticket_volume is None:
                rag_ticket_volume = 0
            if rag_history_summary is None:
                rag_history_summary = {}
            if historical_matches is None:
                historical_matches = []

    return analyze_maintenance_fault(
        complaint=complaint,
        image_base64=image_base64,
        mime_type=mime_type,
        historical_matches=historical_matches,
        rag_ticket_volume=rag_ticket_volume,
        rag_history_summary=rag_history_summary,
        org_id=org_id
    )


def sync_to_airtable(ticket: dict, image_payload: str = None) -> bool:
    """
    Pass-through helper to persist ticket and fault photo directly to Airtable.
    Gracefully logs and continues if Airtable environment variables are not configured.
    """
    airtable_api_key = os.environ.get("AIRTABLE_API_KEY")
    airtable_base_id = os.environ.get("AIRTABLE_BASE_ID")
    airtable_table_name = os.environ.get("AIRTABLE_TABLE_NAME", "MaintenanceTickets")

    if not airtable_api_key or not airtable_base_id:
        # Standard in AWS deployment when Airtable is disabled or optional
        return False

    url = f"https://api.airtable.com/v0/{airtable_base_id}/{urllib.parse.quote(airtable_table_name)}"
    headers = {
        "Authorization": f"Bearer {airtable_api_key}",
        "Content-Type": "application/json"
    }

    img_data = image_payload or ticket.get("image") or ticket.get("photo") or ticket.get("imageUrl") or ""

    fields = {
        "Ticket ID": ticket.get("id"),
        "Title": ticket.get("title", ""),
        "Description": ticket.get("description", ""),
        "Category": ticket.get("category", "General"),
        "Priority": ticket.get("priority", "Routine"),
        "Status": ticket.get("status", "Assigned"),
        "Location": ticket.get("location", "Campus Facilities"),
        "Reporter Email": ticket.get("reporterEmail", ""),
        "RAG Ticket Volume": ticket.get("ragTicketVolume", 1),
        "Priority Score": ticket.get("priorityScore", 40),
    }

    if img_data:
        if img_data.startswith("http://") or img_data.startswith("https://"):
            fields["Attachments"] = [{"url": img_data}]
        else:
            fields["ImagePayload"] = img_data[:100000]

    record_payload = json.dumps({"fields": fields}).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=record_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"[Airtable Sync Notice] Failed forwarding to Airtable: {e}")
        return False


def lambda_handler(event: dict, context: any) -> dict:
    """
    AWS Lambda entrypoint conforming to AWS API Gateway proxy integration.
    Handles REST, HTTP APIs, and direct Lambda invocations.
    Enforces strict visual verification: rejects irrelevant images with HTTP 422 before storage/Airtable/Pinecone.
    """
    # Extract path
    path = event.get("path") or event.get("rawPath") or "/api/v1/tickets"
    
    # Extract method
    method = event.get("httpMethod")
    if not method and "requestContext" in event and "http" in event["requestContext"]:
        method = event["requestContext"]["http"].get("method")
    if not method:
        method = "POST" if event.get("body") or event.get("complaint") else "GET"

    # Extract headers
    headers = event.get("headers") or {}

    # Extract body
    body = event.get("body")
    incoming_image = ""
    parsed_body = {}

    if body is None:
        # Direct Lambda invocation payload (e.g. testing in AWS console)
        if "complaint" in event or "email" in event or "status" in event:
            body = event
            parsed_body = event
            incoming_image = event.get("image") or event.get("photo") or event.get("imageUrl") or ""
        else:
            body = {}
    elif isinstance(body, str):
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict):
                parsed_body = parsed
                incoming_image = parsed.get("image") or parsed.get("photo") or parsed.get("imageUrl") or ""
        except Exception:
            pass
    elif isinstance(body, dict):
        parsed_body = body
        incoming_image = body.get("image") or body.get("photo") or body.get("imageUrl") or ""

    # Direct visual verification pre-check for direct invocations or routing
    complaint_text = parsed_body.get("complaint") or parsed_body.get("description") or ""
    if method == "POST" and complaint_text and incoming_image:
        ticket_data = run_rag_multimodal_analysis(complaint_text, incoming_image)
        if ticket_data.get("imageMatchesComplaint") is False:
            # Backend Rejection & HTTP 422 Response:
            # Immediately abort. Do not save to Airtable, do not upsert to Pinecone.
            warning_msg = ticket_data.get("imageValidationWarning") or f"Photo Irrelevant: You described '{complaint_text[:40].strip()}', but the photo shows an unrelated object or artwork. Please upload a real photo of the broken equipment."
            return {
                "statusCode": 422,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": headers.get("origin") or headers.get("Origin") or "*",
                    "Access-Control-Allow-Credentials": "true"
                },
                "body": json.dumps({
                    "success": False,
                    "warning": True,
                    "imageMatchesComplaint": False,
                    "message": warning_msg
                })
            }

    response = handle_api_request(
        path=path,
        method=method,
        headers=headers,
        body_data=body
    )

    # Ensure returned ticket JSON object always includes image payload under image, photo, and imageUrl
    if isinstance(response, dict) and "body" in response and isinstance(response["body"], str):
        try:
            resp_body = json.loads(response["body"])
            if isinstance(resp_body, dict):
                # If backend returned rejection from handle_api_request, return as-is
                if resp_body.get("imageMatchesComplaint") is False:
                    response["statusCode"] = 422
                    return response

                # Check single ticket response (Verified ticket passed gate)
                if "ticket" in resp_body and isinstance(resp_body["ticket"], dict):
                    t = resp_body["ticket"]
                    img = t.get("image") or t.get("photo") or t.get("imageUrl") or incoming_image or None
                    if img:
                        t["image"] = img
                        t["photo"] = img
                        t["imageUrl"] = img
                        sync_to_airtable(t, img)
                    resp_body["ticket"] = t
                    response["body"] = json.dumps(resp_body)
                # Check tickets array response
                elif "tickets" in resp_body and isinstance(resp_body["tickets"], list):
                    for t in resp_body["tickets"]:
                        if isinstance(t, dict):
                            img = t.get("image") or t.get("photo") or t.get("imageUrl")
                            if img:
                                t["image"] = img
                                t["photo"] = img
                                t["imageUrl"] = img
                    response["body"] = json.dumps(resp_body)
        except Exception:
            pass

    return response
