import { getD1CutoverChecks } from "../../lib/d1-cutover-check";

export async function AdminCutoverCheckPanel({ adminUserId }: { adminUserId: string }) {
  const checks = await getD1CutoverChecks(adminUserId);
  const ready = checks.every((check) => check.status !== "fail");
  return <div className="admin-workspace">
    <div className={`admin-result ${ready ? "" : "is-error"}`} role="status">{ready ? "切替前の必須確認は通過しています。" : "切替条件を満たしていない項目があります。D1への切替は行わないでください。"}</div>
    <div className="admin-entity-list">{checks.map((check) => <article className="admin-entity-card" key={check.name}><div className="admin-entity-head"><strong>{check.name}</strong><span className={`status-badge ${check.status === "pass" ? "" : check.status === "fail" ? "status-open" : "status-dismissed"}`}>{check.status === "pass" ? "確認済み" : check.status === "fail" ? "要対応" : "要確認"}</span></div><p>{check.detail}</p></article>)}</div>
  </div>;
}
