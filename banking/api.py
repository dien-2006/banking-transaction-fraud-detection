from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from decimal import Decimal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from banking.config import DatabaseSettings
from banking.service import BankingError, BankingService, TransferCommand


service = BankingService(DatabaseSettings.from_env())
LOG = logging.getLogger(__name__)


class TransferRequest(BaseModel):
    customer_id: int
    source_account_id: int
    destination_account_id: int
    amount: Decimal = Field(gt=0)
    idempotency_key: str = Field(min_length=1, max_length=100)
    device_id: int | None = None
    channel: str = "MobileBanking"
    description: str | None = None


class ReviewRequest(BaseModel):
    action: str
    reviewer_user_id: int | None = None
    reason: str | None = None


async def _recovery_loop() -> None:
    interval = float(os.getenv("BANKING_RECOVERY_INTERVAL_SECONDS", "10"))
    while True:
        try:
            await asyncio.to_thread(service.recover_allowed_transfers)
            await asyncio.to_thread(service.predictor.reload_if_changed)
        except Exception:
            LOG.exception("banking recovery/model reload iteration failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_recovery_loop())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


app = FastAPI(title="Bank Fraud Detection Banking API", version="1.0.0", lifespan=lifespan)


def _handle(error: BankingError) -> HTTPException:
    status = 404 if error.code == "NOT_FOUND" else 409
    return HTTPException(status_code=status, detail={"code": error.code, "message": str(error)})


@app.get("/health")
def health() -> dict:
    try:
        return service.health()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/transactions/transfers")
def create_transfer(request: TransferRequest) -> dict:
    try:
        return service.create_transfer(TransferCommand(**request.model_dump()))
    except BankingError as exc:
        raise _handle(exc) from exc


@app.get("/transactions/{transaction_id}")
def get_transaction(transaction_id: int) -> dict:
    try:
        return service.get_transaction(transaction_id)
    except BankingError as exc:
        raise _handle(exc) from exc


@app.post("/reviews/{review_case_id}")
def review(review_case_id: int, request: ReviewRequest) -> dict:
    try:
        return service.review_transfer(review_case_id, request.action, request.reviewer_user_id, request.reason)
    except BankingError as exc:
        raise _handle(exc) from exc


@app.post("/models/reload")
def reload_model() -> dict:
    return {"model_version": service.predictor.reload(), "status": "reloaded"}
