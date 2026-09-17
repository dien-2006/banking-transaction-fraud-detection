# Thiết lập môi trường

Cài Python và mở terminal tại thư mục gốc dự án.

## 1. Tạo file `.env`

Sao chép `.env.example` thành `.env` trong cùng thư mục với `docker-compose.yml`.

**Windows — PowerShell:**

```powershell
Copy-Item .env.example .env
```

**Linux/macOS:**

```bash
cp .env.example .env
```

Mở `.env`, sửa `POSTGRES_PASSWORD` thành mật khẩu riêng và điều chỉnh các thông tin kết nối nếu cần. Chỉ sao chép khi chưa có `.env` để tránh ghi đè cấu hình.

## 2. Tạo môi trường Python

**Windows — PowerShell:**

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Nếu PowerShell chặn kích hoạt, mở Command Prompt tại thư mục dự án và chạy:

```bat
.venv\Scripts\activate.bat
```

**Linux/macOS:**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Sau khi kích hoạt, cài thư viện từ `requirements.txt` của dự án:

```bash
python -m pip install -r requirements.txt
```

Thoát môi trường khi làm xong:

```bash
deactivate
```

Thêm hai dòng sau vào `.gitignore` để không đưa cấu hình cá nhân và môi trường Python lên Git:

```gitignore
.env
.venv/
```

Giữ `.env.example` trên Git để các thành viên dùng làm mẫu. File `.env` không tự được Python nạp; ứng dụng cần mã đọc cấu hình nếu sử dụng các biến này.
