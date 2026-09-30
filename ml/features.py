"""Single source of truth for the online/offline fraud feature contract."""

FEATURES = (
    "amount_log",
    "is_new_device",
    "is_unusual_time",
    "transactions_last_10m",
    "failed_logins_last_30m",
    "amount_to_average_ratio",
)
