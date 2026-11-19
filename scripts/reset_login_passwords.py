"""Explicitly reset every application login password; never change bank accounts."""
from __future__ import annotations

import argparse
from getpass import getpass
from pathlib import Path
import sys

import psycopg
from dotenv import load_dotenv

from scripts.postgres_config import postgres_dsn


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Mật khẩu phải có ít nhất 8 ký tự.")
    if "\x00" in password or len(password.encode("utf-8")) > 72:
        raise ValueError("Mật khẩu không được chứa ký tự NUL hoặc vượt quá 72 byte UTF-8.")


def reset_passwords(connection, password: str) -> dict[str, int]:
    validate_password(password)
    # Both updates commit together, or roll back together. A salt is generated
    # for each row; the same password does not give every account the same hash.
    with connection.transaction():
        connection.execute("SET LOCAL lock_timeout='5s'")
        connection.execute("SET LOCAL statement_timeout='120s'")
        staff = connection.execute(
            'UPDATE banking."system_user" '
            "SET passwordhash=public.crypt(%s,public.gen_salt('bf',12))",
            (password,),
        ).rowcount
        customers = connection.execute(
            "UPDATE banking.customer_online_account "
            "SET passwordhash=public.crypt(%s,public.gen_salt('bf',12))",
            (password,),
        ).rowcount
    return {"staff": staff, "customers": customers}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", required=True,
                        help="Đặt lại mật khẩu của tất cả tài khoản đăng nhập ứng dụng")
    parser.parse_args()
    if not sys.stdin.isatty():
        print("Hãy chạy trong terminal tương tác để nhập mật khẩu ẩn.", file=sys.stderr)
        return 1
    print("Đặt cùng một mật khẩu mới cho toàn bộ admin/nhân viên và khách hàng.")
    password = getpass("Mật khẩu mới: ")
    confirmation = getpass("Nhập lại mật khẩu mới: ")
    try:
        validate_password(password)
        if password != confirmation:
            raise ValueError("Hai mật khẩu không khớp. Chưa thay đổi dữ liệu.")
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    try:
        with psycopg.connect(postgres_dsn()) as connection:
            counts = reset_passwords(connection, password)
    except (psycopg.Error, KeyError):
        print("Không thể đặt lại mật khẩu. Transaction đã rollback; kiểm tra kết nối DB, quyền và pgcrypto.", file=sys.stderr)
        return 1
    print(f"Đã đổi mật khẩu: {counts['staff']} admin/nhân viên, {counts['customers']} khách hàng.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
