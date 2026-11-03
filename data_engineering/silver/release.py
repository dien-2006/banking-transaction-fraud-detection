"""Pin all stages to the Silver snapshot belonging to their batch."""
import hashlib
import os


def configure_silver_release(batch_id: str) -> str:
    prefix = 'releases/silver_r_' + hashlib.sha256(batch_id.encode()).hexdigest()[:20]
    os.environ['SILVER_VERSION_PREFIX'] = prefix
    return prefix
