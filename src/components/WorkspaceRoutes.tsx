import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Role } from "../shared/types";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { Spinner } from "./ui";

const Dashboard = lazy(() =>
  import("../pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Progress = lazy(() =>
  import("../pages/Progress").then((m) => ({ default: m.Progress })),
);
const Account = lazy(() =>
  import("../pages/Account").then((m) => ({ default: m.Account })),
);
const Library = lazy(() =>
  import("../pages/Library").then((m) => ({ default: m.Library })),
);
const Builder = lazy(() =>
  import("../pages/Builder").then((m) => ({ default: m.Builder })),
);
const Batches = lazy(() =>
  import("../pages/Batches").then((m) => ({ default: m.Batches })),
);
const Reviews = lazy(() =>
  import("../pages/Reviews").then((m) => ({ default: m.Reviews })),
);
const ReviewDetail = lazy(() =>
  import("../pages/ReviewDetail").then((m) => ({ default: m.ReviewDetail })),
);
const People = lazy(() =>
  import("../pages/People").then((m) => ({ default: m.People })),
);
const Processes = lazy(() =>
  import("../pages/Processes").then((m) => ({ default: m.Processes })),
);
const Learning = lazy(() =>
  import("../pages/Learning").then((m) => ({ default: m.Learning })),
);

export function WorkspaceRoutes({ role }: { role: Role }) {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<Spinner label="Opening page…" />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/account" element={<Account />} />
          <Route path="/training" element={<Dashboard trainingOnly />} />
          {role !== "agent" && (
            <>
              <Route path="/scenarios" element={<Library />} />
              <Route path="/scenarios/new" element={<Builder />} />
              <Route path="/scenarios/:id" element={<Builder />} />
              <Route path="/batches" element={<Batches />} />
              <Route path="/reviews" element={<Reviews />} />
              <Route path="/reviews/:id" element={<ReviewDetail />} />
              <Route path="/people" element={<People />} />
            </>
          )}
          {role === "admin" && (
            <>
              <Route path="/processes" element={<Processes />} />
            </>
          )}
          <Route
            path="/learn/:id"
            element={<Learning key={location.pathname} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}
