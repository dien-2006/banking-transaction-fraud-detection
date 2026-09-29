from __future__ import annotations

from datetime import timedelta

import pendulum
from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.empty import EmptyOperator


RUN_ID = "{{ run_id | replace(':', '_') | replace('+', '_') }}"
BATCH_ID = "batch-{{ ts_nodash }}"
BASE = "python3 /workspace/data_engineering/jobs/pipeline.py"
SPARK = "/opt/spark/bin/spark-submit --master spark://spark-master:7077 --conf spark.submit.deployMode=client /workspace/data_engineering/jobs/pipeline.py"


def spark_task(task_id: str, stage: str, timeout_minutes: int = 60) -> BashOperator:
    return BashOperator(
        task_id=task_id,
        bash_command=f"{SPARK} {stage} --run-id '{RUN_ID}' --batch-id '{BATCH_ID}'",
        execution_timeout=timedelta(minutes=timeout_minutes),
        env={"PYTHONPATH": "/workspace"},
        append_env=True,
    )


with DAG(
    dag_id="banking_bronze_silver_gold",
    description="PostgreSQL/Kafka Bronze to trusted Silver and star-schema Gold",
    schedule="0 1 * * *",
    start_date=pendulum.datetime(2026, 1, 1, tz="Asia/Ho_Chi_Minh"),
    catchup=False,
    max_active_runs=1,
    default_args={"owner": "data-platform", "retries": 2, "retry_delay": timedelta(minutes=5)},
    tags=["banking", "spark", "bronze", "silver", "gold"],
) as dag:
    start = EmptyOperator(task_id="start")
    check_dependencies = spark_task("check_dependencies", "check", 10)
    create_run_context = BashOperator(task_id="create_run_context", bash_command=f"echo run_id='{RUN_ID}' batch_id='{BATCH_ID}'")
    determine_batch_load = BashOperator(
        task_id="determine_batch_load",
        bash_command="python3 -c \"from data_engineering.common.config import source_catalog; print({k:v['strategy'] for k,v in source_catalog()['datasets'].items()})\"",
        env={"PYTHONPATH": "/workspace"}, append_env=True,
    )
    extract = spark_task("spark_extract_postgres_to_bronze", "extract", 90)
    validate_bronze = spark_task("validate_bronze", "validate-bronze", 30)
    silver = spark_task("spark_bronze_to_silver", "silver", 90)
    silver_dq = spark_task("silver_data_quality", "silver-dq", 60)
    save_watermark = BashOperator(
        task_id="save_successful_watermark",
        bash_command=f"{BASE} commit-state --run-id '{RUN_ID}' --batch-id '{BATCH_ID}'",
        env={"PYTHONPATH": "/workspace"}, append_env=True,
    )
    gold_dimensions = spark_task("build_gold_dimensions", "gold-dimensions", 60)
    gold_dimension_dq = spark_task("gold_dimension_quality", "gold-dimension-dq", 30)
    gold_facts = spark_task("build_gold_facts", "gold-facts", 60)
    gold_fact_dq = spark_task("gold_fact_quality", "gold-fact-dq", 30)
    train_model = BashOperator(
        task_id="train_fraud_model_from_curated_silver",
        bash_command=f"/opt/spark/bin/spark-submit --master spark://spark-master:7077 /workspace/ml/training/train.py --run-id '{RUN_ID}' --batch-id '{BATCH_ID}'",
        execution_timeout=timedelta(minutes=60),
        env={"PYTHONPATH": "/workspace"}, append_env=True,
    )
    summary = BashOperator(task_id="pipeline_summary", bash_command=f"echo pipeline SUCCESS run_id='{RUN_ID}' batch_id='{BATCH_ID}'")
    end = EmptyOperator(task_id="end")

    start >> check_dependencies >> create_run_context >> determine_batch_load >> extract
    extract >> validate_bronze >> silver >> silver_dq >> save_watermark
    save_watermark >> gold_dimensions >> gold_dimension_dq >> gold_facts >> gold_fact_dq >> train_model >> summary >> end
