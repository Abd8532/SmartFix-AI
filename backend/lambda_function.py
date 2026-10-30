"""
FixFlow AI - AWS Lambda Entrypoint Adapter
Wraps the modular backend application into an AWS API Gateway proxy handler.
"""
import json
from app.api import handle_api_request


def lambda_handler(event: dict, context: any) -> dict:
    """
    AWS Lambda entrypoint conforming to AWS API Gateway proxy integration.
    Handles REST, HTTP APIs, and direct Lambda invocations.
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
    if body is None:
        # Direct Lambda invocation payload (e.g. testing in AWS console)
        if "complaint" in event or "email" in event or "status" in event:
            body = event
        else:
            body = {}

    return handle_api_request(
        path=path,
        method=method,
        headers=headers,
        body_data=body
    )
