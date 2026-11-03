from data_engineering.silver.release import configure_silver_release
from data_engineering.common.config import s3a


def test_retry_old_batch_keeps_its_original_silver_input(monkeypatch):
    monkeypatch.setenv('MINIO_BUCKET_SILVER', 'silver')
    monkeypatch.setenv('SILVER_VERSION_PREFIX', '')
    first = configure_silver_release('batch-B')
    old_input = s3a('MINIO_BUCKET_SILVER', 'bank_transaction')
    configure_silver_release('batch-C')
    assert s3a('MINIO_BUCKET_SILVER', 'bank_transaction') != old_input
    assert configure_silver_release('batch-B') == first
    assert s3a('MINIO_BUCKET_SILVER', 'bank_transaction') == old_input
