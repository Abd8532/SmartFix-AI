"""
FixFlow AI - AWS Lambda Entrypoint Adapter
Wraps the modular backend application into an AWS API Gateway proxy handler.
Guarantees ticket image payload persistence across 'image', 'photo', and 'imageUrl',
and passes image data straight through to Airtable and frontend responses.
"""
import json
import os
import urllib.request
import urllib.error
from app.api import handle_api_request


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
    Guarantees image persistence under ticket['image'], ticket['photo'], and ticket['imageUrl'].
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

    if body is None:
        # Direct Lambda invocation payload (e.g. testing in AWS console)
        if "complaint" in event or "email" in event or "status" in event:
            body = event
            incoming_image = event.get("image") or event.get("photo") or event.get("imageUrl") or ""
        else:
            body = {}
    elif isinstance(body, str):
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict):
                incoming_image = parsed.get("image") or parsed.get("photo") or parsed.get("imageUrl") or ""
        except Exception:
            pass
    elif isinstance(body, dict):
        incoming_image = body.get("image") or body.get("photo") or body.get("imageUrl") or ""

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
                # Check single ticket response
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
