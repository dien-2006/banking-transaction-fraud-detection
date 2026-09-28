# Môi trường Python

Chạy lệnh từ thư mục gốc repository.

## Tạo mới bằng Conda

```bash
conda env create -f environment.yml
conda activate bank-fraud
```

## Cài vào môi trường đã có

```bash
conda activate bank-fraud
python -m pip install -r requirements.txt
python -m pip check
```

`requirements.txt` khai báo dependency trực tiếp với khoảng phiên bản; chưa phải lockfile tái lập chính xác toàn bộ dependency. Python mục tiêu là 3.11. Dùng interpreter của môi trường bank-fraud trong IDE.

Các nhóm thư viện: FastAPI/Uvicorn/Pydantic cho API; SQLAlchemy/Psycopg/Alembic cho PostgreSQL; confluent-kafka và MinIO cho pipeline; NumPy/Pandas/PyArrow cho ETL; Faker cho dữ liệu giả lập; scikit-learn/joblib cho baseline ML; matplotlib/seaborn cho phân tích; pytest/httpx cho kiểm thử; ipykernel cho notebook.

SQLAlchemy dùng driver Psycopg 3 với URL `postgresql+psycopg://`. Điều này không thay đổi cấu hình Psycopg 2 của Airflow trong Docker.

PostgreSQL, Kafka, MinIO và Airflow chạy qua Docker Compose. Package cài trên host không tự có trong container Airflow. Khi viết DAG, phải bổ sung dependency/provider tương thích vào image Airflow riêng. PySpark chưa cài vì chưa chốt phiên bản Spark/Java và môi trường thực thi; bổ sung sau khi chọn runtime. Chưa lựa chọn thư viện dashboard hoặc mô hình boosting cụ thể.

## Kiểm tra

```bash
python -m pip check
python -c "import fastapi, sqlalchemy, psycopg, confluent_kafka, minio, pandas, pyarrow, sklearn; print('Import OK')"
```

Import thành công chỉ xác nhận thư viện tải được, chưa xác nhận kết nối hạ tầng hoặc nghiệp vụ ngân hàng hoạt động.

Tham khảo: https://docs.conda.io/projects/conda/en/stable/user-guide/tasks/manage-environments.html và https://www.psycopg.org/psycopg3/docs/basic/install.html.
