"""Register an immutable artifact identity using existing MODEL_VERSION columns."""
import argparse
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import psycopg
from dotenv import load_dotenv
from scripts.postgres_config import postgres_dsn


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True)
    parser.add_argument('--publish-artifact', action='store_true', help='Archive this exact immutable joblib and sidecar in MinIO')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    from ml.inference.joblib_predictor import JoblibPredictor
    path = root / 'models/fraud_detection_model.joblib'
    predictor = JoblibPredictor(path, path.with_name('model_metadata.json'))
    _, identity = predictor._load()
    load_dotenv(root / '.env')
    if args.publish_artifact:
        from minio import Minio
        from minio.error import S3Error
        endpoint=os.getenv('MINIO_ENDPOINT', 'http://localhost:'+os.getenv('MINIO_API_PORT','9000'))
        client=Minio(endpoint.removeprefix('http://').removeprefix('https://'),
                     access_key=os.getenv('MINIO_ACCESS_KEY') or os.environ['MINIO_ROOT_USER'],
                     secret_key=os.getenv('MINIO_SECRET_KEY') or os.environ['MINIO_ROOT_PASSWORD'],
                     secure=endpoint.startswith('https://'))
        bucket=os.getenv('MINIO_BUCKET_ML','ml-models')
        for source,digest in ((path,identity['sha256']),(path.with_name('model_metadata.json'),identity['metadataSha256'])):
            body=source.read_bytes()
            if hashlib.sha256(body).hexdigest()!=digest:
                raise ValueError('Artifact changed during registration; retry with a stable input')
            key=f"fraud_detection/{identity['version']}/{digest}/{source.name}"
            try:
                existing=client.stat_object(bucket,key)
                if existing.metadata.get('x-amz-meta-sha256') != digest:
                    raise ValueError('Immutable archived artifact has different provenance')
            except S3Error as error:
                if error.code!='NoSuchKey':
                    raise
                client.put_object(bucket,key,BytesIO(body),len(body),metadata={'sha256':digest})
    with psycopg.connect(postgres_dsn()) as connection:
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('d4-register-joblib',0))")
        row = connection.execute("SELECT modelversionid,status FROM banking.model_version WHERE modelname=%s ORDER BY modelversionid DESC LIMIT 1", (identity['databaseName'],)).fetchone()
        if row and row[1] != 'ACTIVE':
            raise ValueError('Existing artifact identity is not ACTIVE; explicit lifecycle review is required')
        if not row:
            row = connection.execute("INSERT INTO banking.model_version(modelname,modeltype,status,description) VALUES(%s,'XGBOOST','ACTIVE',%s) RETURNING modelversionid,status", (identity['databaseName'], 'sha256='+identity['sha256'])).fetchone()
    print(json.dumps({'modelVersionId': row[0], **identity}))


if __name__ == '__main__':
    main()
