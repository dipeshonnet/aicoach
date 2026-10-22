import { Users } from "lucide-react";

export function Stat({
  label,
  value,
  icon: Icon,
  detail,
  warm = false,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  detail: string;
  warm?: boolean;
}) {
  return (
    <div className="stat-card">
      <div>
        <span>{label}</span>
        <span className={"stat-icon " + (warm ? "warm" : "")}>
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
