"""Immutable Gold release naming shared by build, DQ and publication."""
from __future__ import annotations
import hashlib
import os


def release_name(batch_id: str) -> str:
    return 'gold_r_' + hashlib.sha256(batch_id.encode()).hexdigest()[:20]


def configure_release(batch_id: str) -> str:
    name=release_name(batch_id)
    os.environ['GOLD_VERSION_PREFIX']=f'releases/{name}'
    return name
