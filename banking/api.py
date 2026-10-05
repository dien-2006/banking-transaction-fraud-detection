from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from decimal import Decimal
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from banking.config import MODEL_ARTIFACT_PATH, POSTGRES_SCHEMA, postgres_dsn
from banking.service import BusinessRejection, TransferService
from ml.inference import FraudPredictor

LOG = logging.getLogger("banking-api")
service = TransferService(postgres_dsn(), FraudPredictor(MODEL_ARTIFACT_PATH), POSTGRES_SCHEMA)


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop = asyncio.Event()
    interval = max(1, int(os.getenv("BANKING_RECOVERY_INTERVAL_SECONDS", "10")))

    async def recovery_loop() -> None:
        while not stop.is_set():
            try:
                metrics = await asyncio.to_thread(service.recover_pending)
                if metrics["candidates"]:
                    LOG.info("banking_recovery metrics=%s", metrics)
            except Exception:
                LOG.exception("banking_recovery_failed")
            try:
                await asyncio.wait_for(stop.wait(), timeout=interval)
            except TimeoutError:
                pass

    task = asyncio.create_task(recovery_loop())
    try:
        yield
    finally:
        stop.set()
        await task


app = FastAPI(title="Bank Fraud Detection API", version="1.0.0", lifespan=lifespan)


class TransferRequest(BaseModel):
    customer_id: int
    source_account_id: int
    destination_account_id: int
    amount: Decimal = Field(gt=0)
    idempotency_key: str = Field(min_length=1, max_length=100)
    channel: Literal["Counter", "ATM", "POS", "MobileBanking", "InternetBanking", "System"]
    device_id: int | None = None


class ReviewRequest(BaseModel):
    action: Literal["APPROVE", "REJECT"]


@app.get("/health")
def health() -> dict[str, str]:
    try:
        with service._connect() as connection:
            connection.execute("SELECT 1").fetchone()
    except Exception as exc:
        raise HTTPException(503, "database unavailable") from exc
    return {"status": "ok"}


@app.post("/transactions/transfers")
def create_transfer(request: TransferRequest) -> dict:
    try:
        return service.create_transfer(**request.model_dump())
    except BusinessRejection as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/reviews/{review_case_id}")
def review(review_case_id: int, request: ReviewRequest) -> dict:
    try:
        return service.review(review_case_id, request.action == "APPROVE")
    except BusinessRejection as exc:
        raise HTTPException(422, str(exc)) from exc
