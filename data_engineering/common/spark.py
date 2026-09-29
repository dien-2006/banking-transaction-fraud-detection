from __future__ import annotations

from pyspark.sql import DataFrame, SparkSession

from data_engineering.common.config import Settings


def create_spark(app_name: str, settings: Settings, master: str | None = None) -> SparkSession:
    builder = (
        SparkSession.builder.appName(app_name)
        .master(master or settings.spark_master)
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.sources.partitionOverwriteMode", "dynamic")
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        .config("spark.hadoop.fs.s3a.endpoint", settings.minio_url)
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config("spark.hadoop.fs.s3a.connection.ssl.enabled", str(settings.minio_secure).lower())
        .config("spark.hadoop.fs.s3a.access.key", settings.minio_access_key)
        .config("spark.hadoop.fs.s3a.secret.key", settings.minio_secret_key)
        .config("spark.hadoop.fs.s3a.aws.credentials.provider", "org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider")
        .config("spark.hadoop.fs.s3a.committer.name", "directory")
        .config("spark.hadoop.mapreduce.fileoutputcommitter.algorithm.version", "2")
        .config("spark.speculation", "false")
    )
    return builder.getOrCreate()


def read_postgres(spark: SparkSession, settings: Settings, dbtable_or_query: str) -> DataFrame:
    table = dbtable_or_query if not dbtable_or_query.lstrip().lower().startswith("select") else f"({dbtable_or_query}) source_query"
    return (
        spark.read.format("jdbc")
        .option("url", settings.jdbc_url)
        .option("dbtable", table)
        .option("user", settings.postgres_user)
        .option("password", settings.postgres_password)
        .option("driver", "org.postgresql.Driver")
        .option("fetchsize", "10000")
        .load()
    )


def write_parquet(frame: DataFrame, path: str, mode: str = "overwrite", partition_by: list[str] | None = None) -> None:
    writer = frame.write.mode(mode).format("parquet")
    if partition_by:
        writer = writer.partitionBy(*partition_by)
    writer.save(path)
