"""Named feature contracts for the online joblib and legacy research artifacts."""

JOBLIB_FEATURES = (
    "amount", "channel", "type_code", "hour", "day_of_week",
    "is_night_transaction", "account_age_days", "txn_count_1h",
    "txn_count_24h", "txn_count_7d", "txn_count_30d", "avg_amount_30d",
    "max_amount_30d", "amount_to_avg_ratio", "failed_login_count_24h",
    "successful_login_count_24h", "failed_login_count_1h",
    "time_since_last_transaction", "login_failure_ratio_24h",
)

FEATURES = (
    "amount_log",
    "is_new_device",
    "is_unusual_time",
    "transactions_last_10m",
    "failed_logins_last_30m",
    "amount_to_average_ratio",
)
