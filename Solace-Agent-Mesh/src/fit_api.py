import os
import uuid

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Resume Fit API")

DEFAULT_GATEWAY_URL = "http://localhost:8000"
DEFAULT_AGENT_NAME = "OrchestratorAgent"


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

    return response.json()
