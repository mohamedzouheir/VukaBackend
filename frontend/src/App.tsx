/*
 * Routes, route gating, and the shell they render inside.
 *
 * The gate is a convenience and a courtesy, not the security boundary. The boundary is
 * FirebaseTokenFilter, the capability table and the entityId claim on the signed token, and it
 * holds whether or not this file is correct. What the gate buys is that the interface never
 * offers a control that will be refused, because a refused click reads as a broken product.
 *
 * Gating is by capability rather than by role, and the capability list comes from the server, so
 * a route is open exactly when the API behind it would answer. That is one table read by both
 * sides instead of two lists that drift.
 *
 * The two counts the rail badges carry are fetched once here rather than per screen, so the
 * number beside Risk & Alerts and the number beside Tasks are the same numbers those screens
 * show. A failed fetch leaves a badge absent rather than showing a zero.
 */
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { can, useAuth } from './lib/auth';
import { api } from './lib/api';
import { useAsync } from './lib/useAsync';
import type { Capability } from './lib/types';
import { AppShell } from './components/AppShell';
import { Loading, NotFoundState } from './components/Shell';
import { SignIn } from './routes/SignIn';
import { Landing } from './routes/Landing';
import { Register } from './routes/Register';
import { ForgotPassword } from './routes/ForgotPassword';
import { Dashboard } from './routes/Dashboard';
import { Entities } from './routes/Entities';
import { RiskAlerts } from './routes/RiskAlerts';
import { Workspaces } from './routes/Workspaces';
import { Documents } from './routes/Documents';
import { Tasks } from './routes/Tasks';
import { Logs } from './routes/Logs';
import { Analytics } from './routes/Analytics';
import { EntityHome } from './routes/EntityHome';
import { TemplateUpload } from './routes/TemplateUpload';
import { ExtractionReview } from './routes/ExtractionReview';
import { ReviewQueue } from './routes/ReviewQueue';
import { SubmissionReview } from './routes/SubmissionReview';
import { Portfolio } from './routes/Portfolio';
import { EntityDrilldown } from './routes/EntityDrilldown';
import { UnitCost } from './routes/UnitCost';
import { EntityAdmin } from './routes/EntityAdmin';

export function App() {
  const { ready, me } = useAuth();

  const signedIn = Boolean(me);
  // The critical count badges the reviewer's Risk & Alerts and the executive's bell. The admin's
  // surface carries neither, so it does not pay for the portfolio request.
  const oversight = can(me, 'VIEW_PORTFOLIO' as Capability) && me?.role !== 'ADMIN';
  // Only the roles whose rail carries Tasks fetch the count for its badge.
  const tasksInRail = me?.role === 'ENTITY_REPORTER' || me?.role === 'DSAC_REVIEWER' || me?.role === 'ADMIN';

  const portfolio = useAsync(() => api.portfolio(), [signedIn, oversight], signedIn && oversight);
  const tasks = useAsync(() => api.myTasks(), [signedIn, tasksInRail], signedIn && tasksInRail);

  if (!ready) return <Loading what="your account" />;

  /*
   * Signed out has its own routes now. A visitor arrives on the landing screen rather than on a
   * form, which is what the design does, and sign in, register and password reset are reachable
   * addresses rather than states of one component. Anything else redirects to the landing page,
   * so a deep link into the dashboard while signed out lands somewhere that explains itself.
   */
  if (!me) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        {/* Reachable so the design can be opened, but not linked from sign in: accounts are
            issued by the Department, because the entity a reporter may report for is a claim on
            their token. Registering here applies to be onboarded rather than creating an account. */}
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const criticalCount = portfolio.data
    ? portfolio.data.filter((r) => r.band === 'CRITICAL').length
    : null;
  const openTaskCount = tasks.data ? tasks.data.filter((t) => t.status !== 'DONE').length : null;

  return (
    <AppShell criticalCount={criticalCount} openTaskCount={openTaskCount}>
      <Routes>
        {/* Every role lands on the same address and each gets its own home there. Four roles
            land in four different places, which is block 2 of the build order. */}
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />

        {/* Oversight. */}
        <Route path="/entities" element={<Gate need="VIEW_PORTFOLIO"><Entities /></Gate>} />
        <Route path="/risk" element={<Gate need="VIEW_PORTFOLIO"><RiskAlerts /></Gate>} />
        <Route path="/analytics" element={<Gate need="VIEW_PORTFOLIO"><Analytics /></Gate>} />
        <Route path="/portfolio" element={<Gate need="VIEW_PORTFOLIO"><Portfolio /></Gate>} />
        <Route path="/portfolio/entity/:entityId" element={<Gate need="VIEW_PORTFOLIO"><EntityDrilldown /></Gate>} />
        <Route path="/portfolio/entity/:entityId/unit-cost" element={<Gate need="VIEW_PORTFOLIO"><UnitCost /></Gate>} />

        {/* Shared. Every signed-in role has a workspace, documents and tasks. */}
        <Route path="/workspaces" element={<Workspaces />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/tasks" element={<Tasks />} />
        {/* The trail is readable by anyone who can read reporting, and a reporter is scoped to
            their own entity by the API rather than by this gate. */}
        <Route path="/logs" element={<Gate need="READ_OWN_REPORTING"><Logs /></Gate>} />

        {/* The reporter path. No entity selector anywhere: the entity is on the token. */}
        <Route path="/entity" element={<Gate need="SUBMIT_REPORTING"><EntityHome /></Gate>} />
        <Route
          path="/entity/submission/:submissionId/upload"
          element={<Gate need="SUBMIT_REPORTING"><TemplateUpload /></Gate>}
        />
        <Route
          path="/entity/submission/:submissionId/review"
          element={<Gate need="SUBMIT_REPORTING"><ExtractionReview /></Gate>}
        />

        {/* The reviewer path. */}
        <Route path="/review" element={<Gate need="REVIEW_SUBMISSIONS"><ReviewQueue /></Gate>} />
        <Route path="/review/:submissionId" element={<Gate need="REVIEW_SUBMISSIONS"><SubmissionReview /></Gate>} />

        {/* Administration. */}
        <Route path="/admin/entities" element={<Gate need="ADMINISTER"><EntityAdmin /></Gate>} />

        <Route path="*" element={<NotFoundState what="page" />} />
      </Routes>
    </AppShell>
  );
}

/**
 * The home screen, by role.
 *
 * The executive's home is the portfolio (W9), the admin's is the publication register and the
 * reporter's is their own reporting screen (W1), rather than a dashboard that restates any of
 * them. Only the reviewer gets a dashboard, because their day starts with a question no single
 * screen answers: which three things to look at first.
 */
function Home() {
  const { me } = useAuth();
  switch (me?.role) {
    case 'DSAC_EXECUTIVE':
      return <Portfolio />;
    case 'ADMIN':
      return <EntityAdmin />;
    case 'ENTITY_REPORTER':
      return <EntityHome />;
    default:
      return <Dashboard />;
  }
}

/**
 * A route a role may not reach reads as a not found rather than as a refusal, for the
 * same reason the API client collapses 403 into 404.
 */
function Gate({ need, children }: { need: Capability; children: ReactNode }) {
  const { me } = useAuth();
  const location = useLocation();

  if (!me) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;

  // The capability list comes from the server, so a route is open exactly when the API
  // behind it would answer.
  if (!can(me, need)) return <NotFoundState what="page" />;

  return <>{children}</>;
}
