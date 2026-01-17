import asyncio
import json
import os
import time
import uuid

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Resume Fit API")

DEFAULT_GATEWAY_URL = "http://localhost:8000"
DEFAULT_AGENT_NAME = "OrchestratorAgent"
DEFAULT_POLL_INTERVAL_SECONDS = 1.0
DEFAULT_POLL_TIMEOUT_SECONDS = 120.0


class FitScoreRequest(BaseModel):
    resume: str
    companyName: str
    companyDesc: str


def _build_prompt(payload: FitScoreRequest) -> str:
    return (
        "You are a resume fit scorer. Use the following inputs:\n\n"
        f"Company Name:\n{payload.companyName}\n\n"
        f"Company Description:\n{payload.companyDesc}\n\n"
        f"Resume:\n{payload.resume}\n"
    )


@app.post("/api/v1/fit-score")
async def fit_score(payload: FitScoreRequest) -> dict:
    gateway_url = os.getenv("SAM_GATEWAY_URL", DEFAULT_GATEWAY_URL).rstrip("/")
    agent_name = os.getenv("SAM_AGENT_NAME", DEFAULT_AGENT_NAME)
    poll_interval = float(
        os.getenv("SAM_POLL_INTERVAL_SECONDS", DEFAULT_POLL_INTERVAL_SECONDS)
    )
    poll_timeout = float(
        os.getenv("SAM_POLL_TIMEOUT_SECONDS", DEFAULT_POLL_TIMEOUT_SECONDS)
    )

    request_body = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": "message/send",
        "params": {
            "message": {
                "kind": "message",
                "messageId": str(uuid.uuid4()),
                "role": "user",
                "metadata": {"agent_name": agent_name},
                "parts": [{"kind": "text", "text": _build_prompt(payload)}],
            }
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{gateway_url}/api/v1/message:send",
                json=request_body,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502, detail=f"Gateway request failed: {exc}"
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    response_json = response.json()
    task_id = (
        response_json.get("result", {})
        .get("id")
    )
    if not task_id:
        raise HTTPException(status_code=502, detail="Missing task id in gateway response")

    deadline = time.time() + poll_timeout
    async with httpx.AsyncClient(timeout=60.0) as client:
        while time.time() < deadline:
            events_response = await client.get(
                f"{gateway_url}/api/v1/tasks/{task_id}/events"
            )
            if events_response.status_code >= 400:
                raise HTTPException(
                    status_code=events_response.status_code, detail=events_response.text
                )

            consolidated = _extract_consolidated_response(events_response.json())
            if consolidated:
                return consolidated

            await asyncio.sleep(poll_interval)

    raise HTTPException(status_code=504, detail="Timed out waiting for agent response")


def _extract_consolidated_response(events_payload: dict) -> dict | None:
    tasks = events_payload.get("tasks", {})
    for task_data in tasks.values():
        events = task_data.get("events", [])
        for event in reversed(events):
            payload = event.get("full_payload", {})
            result = payload.get("result", {})
            message = result.get("message")
            if not message:
                continue
            parts = message.get("parts", [])
            for part in reversed(parts):
                if part.get("kind") == "data":
                    data = part.get("data", {})
                    if _is_consolidated_payload(data):
                        return data
                if part.get("kind") == "text":
                    text = part.get("text", "")
                    parsed = _parse_text_payload(text)
                    if parsed is not None:
                        return parsed
    return None


def _is_consolidated_payload(data: dict) -> bool:
    return (
        isinstance(data, dict)
        and "score" in data
        and "softSkillFeedback" in data
        and "techSkillFeedback" in data
    )


def _parse_text_payload(text: str) -> dict | None:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if _is_consolidated_payload(data) else None
