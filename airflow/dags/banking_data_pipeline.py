from __future__ import annotations

from datetime import timedelta

import pendulum
from airflow import DAG
from airflow.operators.bash import BashOperator


DEFAULT_ARGS = {"owner": "data-platform", "retries": 2, "retry_delay": timedelta(minutes=3)}
SPARK = "spark-submit --driver-memory 512m --conf spark.executor.memory=512m --conf spark.cores.max=1 --conf spark.sql.shuffle.partitions=2 --master $SPARK_MASTER_URL /workspace/data_engineering/jobs/pipeline.py"


def spark_task(task_id: str, stage: str, batch_id: str) -> BashOperator:
    return BashOperator(
        task_id=task_id,
        bash_command=f"{SPARK} {stage} --batch-id '{batch_id}'",
        cwd="/workspace",
        append_env=True,
        execution_timeout=timedelta(minutes=90),
    )


with DAG(
    dag_id="banking_bronze_silver_gold",
    start_date=pendulum.datetime(2026, 1, 1, tz="Asia/Ho_Chi_Minh"),
    schedule="0 1 * * *",
    catchup=False,
    default_args=DEFAULT_ARGS,
    max_active_runs=1,
    tags=["banking", "fraud", "lakehouse"],
) as dag:
    batch = "{{ dag_run.run_id | replace(':', '_') | replace('+', '_') }}"
    check = spark_task("check_dependencies", "check", batch)
    extract = spark_task("postgres_to_bronze", "extract", batch)
    bronze_dq = spark_task("bronze_dq", "bronze-dq", batch)
    silver = spark_task("bronze_to_silver", "silver", batch)
    silver_dq = spark_task("silver_dq", "silver-dq", batch)
    commit_state = spark_task("commit_watermarks", "commit-state", batch)
    gold = spark_task("silver_to_gold", "gold", batch)
    gold_dq = spark_task("gold_dq", "gold-dq", batch)
    catalog = BashOperator(
        task_id="register_trino_views",
        bash_command=f"python -m scripts.publish_gold --batch-id '{batch}'",
        cwd="/workspace",
        append_env=True,
        execution_timeout=timedelta(minutes=5),
    )
    (
        check
        >> extract
        >> bronze_dq
        >> silver
        >> silver_dq
        >> commit_state
        >> gold
        >> gold_dq
        >> catalog
    )
