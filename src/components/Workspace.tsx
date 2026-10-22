import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  CheckCheck,
  CircleHelp,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { Overview } from "../shared/types";
import { api, errorText } from "../lib/api";
import { Badge, ErrorNotice, Spinner, initials } from "./ui";
import { WorkspaceRoutes } from "./WorkspaceRoutes";
import { OverviewProvider } from "../lib/overview";
import { queryKeys } from "../lib/query-keys";

export function Workspace({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const query = useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => api<Overview>("/overview"),
  });
  const [open, setOpen] = useState(false),
    [signError, setSignError] = useState("");
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  if (query.isPending) return <Spinner />;
  if (query.error)
    return (
      <div className="error-page">
        <ErrorNotice message={errorText(query.error)} />
        <button className="button" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  const data = query.data,
    agent = data.user.role === "agent",
    admin = data.user.role === "admin";
  const reviews = data.attempts.filter(
    (t) => t.mode === "assessment" && t.status === "submitted",
  ).length;
  const links = agent
    ? [
        { to: "/", label: "Overview", icon: LayoutDashboard },
        { to: "/training", label: "My training", icon: BookOpen },
        { to: "/progress", label: "My progress", icon: CheckCheck },
      ]
    : [
        { to: "/", label: "Overview", icon: LayoutDashboard },
        { to: "/scenarios", label: "Scenario library", icon: BookOpen },
        { to: "/batches", label: "Training batches", icon: Users },
        {
          to: "/reviews",
          label: "Review queue",
          icon: CheckCheck,
          count: reviews,
        },
        { to: "/progress", label: "Progress & results", icon: GraduationCap },
        { to: "/people", label: "People & access", icon: ShieldCheck },
        ...(admin
          ? [
              { to: "/processes", label: "Client processes", icon: Settings2 },
            ]
          : []),
      ];
  const title =
    links.find((l) => l.to !== "/" && location.pathname.startsWith(l.to))
      ?.label ||
    (location.pathname.startsWith("/learn")
      ? "Practice workspace"
      : "Overview");
  return (
    <OverviewProvider value={data}>
      <div className="app-shell">
        {open && (
          <div className="sidebar-shade" onClick={() => setOpen(false)} />
        )}
        <aside className={"sidebar " + (open ? "open" : "")}>
          <Link to="/" className="brand">
            <span className="brand-symbol">
              <Sparkles size={21} />
            </span>
            AI Coach<span className="brand-dot">.</span>
          </Link>
          <div className="workspace-select">
            <span className="workspace-icon">T</span>
            <span>
              Training workspace<small>BPO Academy</small>
            </span>
          </div>
          <span className="nav-label">WORKSPACE</span>
          <nav>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === "/"}>
                <l.icon size={18} />
                <span>{l.label}</span>
                {"count" in l && !!l.count && (
                  <span className="nav-count">{l.count}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={17} />
            </span>
            <h4>Small steps. Real progress.</h4>
            <p>
              Every practice brings your team closer to a confident first day.
            </p>
            <Link to={agent ? "/training" : "/scenarios"}>
              Explore scenarios <ArrowRight size={14} />
            </Link>
          </div>
          <div className="sidebar-bottom">
            <Link to="/account">
              <Settings2 size={17} />
              Account settings
            </Link>
            <button
              onClick={() =>
                onSignOut().catch((e) => setSignError(errorText(e)))
              }
            >
              <LogOut size={17} />
              Sign out
            </button>
          </div>
        </aside>
        <div className="main-wrap">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setOpen(true)}
              >
                <Menu />
              </button>
              <span>Workspace</span>
              <span>/</span>
              <strong>{title}</strong>
            </div>
            <div className="topbar-user">
              <Badge tone="neutral">{data.user.role}</Badge>
              <div className="avatar">{initials(data.user.name)}</div>
              <span>
                {data.user.name}
                <small>{data.user.email}</small>
              </span>
            </div>
          </header>
          <main className="main-content">
            {signError && <ErrorNotice message={signError} />}
            <WorkspaceRoutes role={data.user.role} />
          </main>
          <footer className="app-footer">
            <span>AI Coach · A little practice goes a long way.</span>
            <span>
              <CircleHelp size={13} />
              Need help? Contact your trainer.
            </span>
          </footer>
        </div>
      </div>
    </OverviewProvider>
  );
}
