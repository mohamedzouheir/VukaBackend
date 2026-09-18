/*
 * Analytics & Insights.
 *
 * This screen is in the rail because the designs put it there, and it says plainly that it is not
 * built. That is a deliberate choice and it is worth defending rather than apologising for.
 *
 * What the design shows: a performance trend from January to June, on-track rate by sector, a
 * quarterly comparison, "performance improved by 12% compared to last quarter", a most-accessed
 * document with 1,248 views, and a most-downloaded template with 856 downloads.
 *
 * What the database holds that could produce any of it: nothing. There is no figure stored per
 * month, no on-track rate per sector, no access log and no download counter. Every number on that
 * mockup would have to be invented.
 *
 * The standing rule on this project is that absent data stays absent, and the product's entire
 * argument is that a figure carries the cell it came from. A screen of invented trends would be
 * the most convincing thing in the build and the least defensible, and the first judge to click
 * into one would find nothing behind it. So the space says what is missing and what it would
 * take, which is a better answer in the room than a chart nobody can stand behind.
 */
import { Link } from 'react-router-dom';
import { PageHead } from '../components/AppShell';
import { IconChart, IconChevronRight, IconInfo } from '../icons';

export function Analytics() {
  return (
    <div>
      <PageHead
        icon={<IconChart size={26} />}
        title="Analytics & Insights"
        subtitle="Not built, and the reason is worth reading."
      />

      <div className="card">
        <p className="row" style={{ gap: 10, margin: 0 }}>
          <IconInfo size={20} />
          <strong>There is no data behind this screen yet.</strong>
        </p>

        <p style={{ marginTop: 'var(--space-3)' }}>
          The design for Analytics &amp; Insights shows a performance trend by month, an on-track
          rate by sector, a quarter-on-quarter comparison, and document view and download counts.
          None of those exist in the schema. Performance is stored per reporting period against a
          target, not per month; there is no sector rate; and nothing counts a view or a download.
        </p>

        <p>
          Every figure on that mockup would therefore have to be invented. This product's whole
          claim is that a reported number carries the cell it came from and the person who
          confirmed it, so a screen of plausible trends would be the most persuasive thing in the
          build and the only part that could not survive being clicked into.
        </p>

        <h3 style={{ marginTop: 'var(--space-5)' }}>What it would take</h3>
        <ul className="an-list">
          <li>
            <strong>Trend over time.</strong> Scores and results are already stored per reporting
            period, so a quarter-by-quarter series is real and buildable today. A monthly one is
            not, and would stay unavailable.
          </li>
          <li>
            <strong>Sector comparison.</strong> Targets achieved against targets set, grouped by
            sector, is computable from data already held. Worth doing, and honest.
          </li>
          <li>
            <strong>Document analytics.</strong> Needs an access log that does not exist. It is
            also the least valuable of the three and carries a POPIA question, because a log of who
            read what is personal information where the other reporting data is not.
          </li>
        </ul>

        <div className="row" style={{ marginTop: 'var(--space-5)' }}>
          <Link className="btn btn-primary" to="/risk">
            Risk &amp; Alerts, which is real <IconChevronRight size={15} />
          </Link>
          <Link className="btn" to="/portfolio">
            Portfolio
          </Link>
        </div>
      </div>
    </div>
  );
}
