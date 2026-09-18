/*
 * Routes and route gating.
 *
 * Block 2 of the build order in section 12: four roles land in four different places, and
 * a reporter cannot reach the portfolio. The gate here is a convenience and a courtesy,
 * not the security boundary. The boundary is FirebaseTokenFilter and the entityId claim on
 * the signed token, and it holds whether or not this file is correct.
 *
 * What the gate does buy is that the interface never offers a control that will be
 * refused, which matters because a refused click reads as a broken product.
 */
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { can, homeFor, useAuth } from './lib/auth';
import type { Capability } from './lib/types';
import { Loading, NotFoundState, Shell } from './components/Shell';
import { SignIn } from './routes/SignIn';
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

  if (!ready) {
    return (
      <Shell>
        <Loading what="your account" />
      </Shell>
    );
  }

  if (!me) return <SignIn />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to={homeFor(me)} replace />} />
        <Route path="/signin" element={<Navigate to={homeFor(me)} replace />} />

        {/* The reporter path. No entity selector anywhere: the entity is on the token. */}
        <Route
          path="/entity"
          element={
            <Gate need="SUBMIT_REPORTING">
              <EntityHome />
            </Gate>
          }
        />
        <Route
          path="/entity/submission/:submissionId/upload"
          element={
            <Gate need="SUBMIT_REPORTING">
              <TemplateUpload />
            </Gate>
          }
        />
        <Route
          path="/entity/submission/:submissionId/review"
          element={
            <Gate need="SUBMIT_REPORTING">
              <ExtractionReview />
            </Gate>
          }
        />

        {/* The reviewer path. */}
        <Route
          path="/review"
          element={
            <Gate need="REVIEW_SUBMISSIONS">
              <ReviewQueue />
            </Gate>
          }
        />
        <Route
          path="/review/:submissionId"
          element={
            <Gate need="REVIEW_SUBMISSIONS">
              <SubmissionReview />
            </Gate>
          }
        />

        {/* The executive path. Read only by design for DSAC_EXECUTIVE. */}
        <Route
          path="/portfolio"
          element={
            <Gate need="VIEW_PORTFOLIO">
              <Portfolio />
            </Gate>
          }
        />
        <Route
          path="/portfolio/entity/:entityId"
          element={
            <Gate need="VIEW_PORTFOLIO">
              <EntityDrilldown />
            </Gate>
          }
        />
        <Route
          path="/portfolio/entity/:entityId/unit-cost"
          element={
            <Gate need="VIEW_PORTFOLIO">
              <UnitCost />
            </Gate>
          }
        />

        <Route
          path="/admin/entities"
          element={
            <Gate need="ADMINISTER">
              <EntityAdmin />
            </Gate>
          }
        />

        <Route path="*" element={<NotFoundState what="page" />} />
      </Routes>
    </Shell>
  );
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
