import asyncio
import json
import logging
import os
import time
import uuid

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(encoding='utf-8')

app = FastAPI(title="Resume Fit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_GATEWAY_URL = "http://localhost:8000"
DEFAULT_AGENT_NAME = "OrchestratorAgent"
DEFAULT_POLL_INTERVAL_SECONDS = 1.0
DEFAULT_POLL_TIMEOUT_SECONDS = 300.0


class FitScoreRequest(BaseModel):
    resume: str
    companyName: str
    jobDesc: str


def _build_prompt(payload: FitScoreRequest) -> str:
    return (
        "You are the Orchestrator. Run this agent chain in order:\n"
        "1) ResumeExtractor on the resume text.\n"
        "2) JobDescriptionExtractor on the job description text.\n"
        "3) HardSkillsMatcher with resume_extracted and job_description_extracted.\n"
        "4) SoftSkillsMatcher with company name, job description, and resume.\n"
        "5) FitReranker with hard_skills and soft_skills.\n\n"
        "Return ONLY the final FitReranker JSON:\n"
        "{\n"
        "  \"score\": 0,\n"
        "  \"softSkillFeedback\": [],\n"
        "  \"techSkillFeedback\": []\n"
        "}\n\n"
        "Inputs:\n\n"
        f"Company Name:\n{payload.companyName}\n\n"
        f"Job Description:\n{payload.jobDesc}\n\n"
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
            if events_response.status_code == 404:
                raise HTTPException(
                    status_code=404,
                    detail="Task not found (may have expired or be on a different gateway).",
                )
            if events_response.status_code >= 400:
                raise HTTPException(
                    status_code=events_response.status_code, detail=events_response.text
                )

            events_payload = events_response.json()
            consolidated = _extract_consolidated_response(events_payload)
            if consolidated:
                return consolidated

            task_status = _get_task_status(events_payload, task_id)
            if task_status == "failed":
                raise HTTPException(
                    status_code=502,
                    detail="Task failed without consolidated response.",
                )
            if task_status == "completed":
                raise HTTPException(
                    status_code=502,
                    detail="Task completed without consolidated response.",
                )

            await asyncio.sleep(poll_interval)

    raise HTTPException(status_code=504, detail="Timed out waiting for agent response")


def _extract_consolidated_response(events_payload: dict) -> dict | None:
    tasks = events_payload.get("tasks", {})
    for task_data in tasks.values():
        events = task_data.get("events", [])
        for event in reversed(events):
            payload = event.get("full_payload", {})
            result = payload.get("result", {})
            message = result.get("status", {}).get("message") or result.get("message")
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


def _get_task_status(events_payload: dict, task_id: str) -> str | None:
    tasks = events_payload.get("tasks", {})
    task = tasks.get(task_id)
    if not task:
        return None
    return task.get("status")


def _is_consolidated_payload(data: dict) -> bool:
    return (
        isinstance(data, dict)
        and "score" in data
        and "softSkillFeedback" in data
        and "techSkillFeedback" in data
    )


def _parse_text_payload(text: str) -> dict | None:
    trimmed = _strip_json_fences(text)
    try:
        data = json.loads(trimmed)
    except json.JSONDecodeError:
        return None
    return data if _is_consolidated_payload(data) else None


def _strip_json_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return stripped
