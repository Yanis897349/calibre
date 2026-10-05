import type { ReactNode } from "react";
import { RoleIcon } from "./identity-media";
import { colors } from "../types";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="role-badge" style={{ color: colors.get(role) }}>
      <RoleIcon role={role} />
      {role}
    </span>
  );
}
