#!/bin/sh
set -eu

metastore_root=/opt/hive/metastore_db
# Existing installations may already have a Derby database at the volume root.
# Preserve that location; Derby needs a not-yet-created child for a fresh volume.
if [ -f "$metastore_root/service.properties" ]; then
    database_path=$metastore_root
else
    if [ -d "$metastore_root/seg0" ] || [ -d "$metastore_root/log" ]; then
        echo 'Incomplete legacy Derby database; inspect/restore the catalog before starting Hive.' >&2
        exit 1
    fi
    database_path=$metastore_root/catalog
fi

export SERVICE_OPTS="${SERVICE_OPTS:-} -Djavax.jdo.option.ConnectionURL=jdbc:derby:;databaseName=$database_path;create=true"
exec /entrypoint.sh
