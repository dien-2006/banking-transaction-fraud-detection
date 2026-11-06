import { recordStatus, type RecordDomain } from "@/lib/record-status";

export function RecordStatus({
  status,
  domain = "general",
}: {
  status: string;
  domain?: RecordDomain;
}) {
  const view = recordStatus(status, domain);
  return (
    <span className={`d4-record-status ${view.tone}`} data-status={status}>
      {view.label}
    </span>
  );
}
