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
import { useI18n } from '../lib/i18n';
import { IconChart, IconChevronRight, IconInfo } from '../icons';

export function Analytics() {
  const { t } = useI18n();
  return (
    <div>
      <PageHead
        icon={<IconChart size={26} />}
        title={t('nav.analytics')}
        subtitle={t('an.subtitle')}
      />

      <div className="card">
        <p className="row" style={{ gap: 10, margin: 0 }}>
          <IconInfo size={20} />
          <strong>{t('an.noData')}</strong>
        </p>

        <p style={{ marginTop: 'var(--space-3)' }}>
          {t('an.body1')}
        </p>

        <p>
          {t('an.body2')}
        </p>

        <h3 style={{ marginTop: 'var(--space-5)' }}>{t('an.whatItTakes')}</h3>
        <ul className="an-list">
          <li>
            <strong>{t('an.trendHead')}</strong> {t('an.trendBody')}
          </li>
          <li>
            <strong>{t('an.sectorHead')}</strong> {t('an.sectorBody')}
          </li>
          <li>
            <strong>{t('an.docsHead')}</strong> {t('an.docsBody')}
          </li>
        </ul>

        <div className="row" style={{ marginTop: 'var(--space-5)' }}>
          <Link className="btn btn-primary" to="/risk">
            {t('an.goRisk')} <IconChevronRight size={15} />
          </Link>
          <Link className="btn" to="/portfolio">
            Portfolio
          </Link>
        </div>
      </div>
    </div>
  );
}
