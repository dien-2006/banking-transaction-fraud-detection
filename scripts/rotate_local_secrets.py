"""Rotate compromised local secrets without changing banking data or external API keys."""
import argparse
import secrets
from pathlib import Path

import psycopg
from psycopg import sql
from dotenv import dotenv_values, set_key


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True)
    parser.add_argument('--env-file', type=Path, default=Path(__file__).resolve().parents[1] / '.env')
    args = parser.parse_args()
    path = args.env_file.resolve()
    values = dotenv_values(path)
    keys = ['POSTGRES_PASSWORD', 'MINIO_ROOT_PASSWORD', 'JWT_SECRET', 'OTP_HASH_SECRET']
    if any(not values.get(key) for key in keys):
        raise ValueError('all local secrets must already be configured before rotation')
    updates = {key: secrets.token_urlsafe(48) for key in keys}
    # Stage the local file first so a failed filesystem write cannot lose the
    # credentials for an already-rotated database role.
    staged = path.with_name(path.name + '.rotation-pending')
    staged.write_text(path.read_text())
    staged.chmod(0o600)
    for key, value in updates.items():
        set_key(str(staged), key, value)
    try:
        with psycopg.connect(host=values.get('POSTGRES_HOST') or 'localhost',
                             port=values.get('POSTGRES_INTERNAL_PORT') or values.get('POSTGRES_PORT') or '5432',
                             dbname=values['POSTGRES_DB'], user=values['POSTGRES_USER'],
                             password=values['POSTGRES_PASSWORD']) as connection:
            connection.execute(sql.SQL('ALTER ROLE {} PASSWORD {}').format(
                sql.Identifier(values['POSTGRES_USER']), sql.Literal(updates['POSTGRES_PASSWORD'])))
        staged.replace(path)
    except Exception:
        # If the role commit succeeded but rename failed, the protected staged
        # file retains the new credential for recovery; never print it.
        raise RuntimeError('rotation did not finish; inspect the protected .rotation-pending file before retrying') from None
    print('Rotated four local secrets. Regenerate scoped environment files and recreate the affected services; external API keys unchanged.')


if __name__ == '__main__':
    main()
