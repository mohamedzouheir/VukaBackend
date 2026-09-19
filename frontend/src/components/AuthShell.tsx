/*
 * The frame the auth screens share, from the screenshots in docs/Front End designs/.
 *
 * Departmental bar across the top, a split below it with the photograph on the left carrying the
 * display copy, the form on the right on cream, and a dark green footer.
 *
 * Every one of those screens is the same frame with different copy and a different form, so it
 * is one component. Building them separately is how the three ended up disagreeing about their
 * padding the first time.
 *
 * <h2>The photograph carries text, so it carries a scrim</h2>
 *
 * The display copy sits over the lower left of the image. Contrast there cannot be left to
 * whatever the photograph happens to be doing at that point, so there is a gradient under the
 * text. Without it this is a screen that passes review on one crop and fails on the next.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LanguagePicker } from './LanguagePicker';
import { Arms } from './Arms';
import { AskKarabo } from './AskKarabo';
import { useI18n } from '../lib/i18n';
import { IconHome } from '../icons';
import './AuthShell.css';

interface Props {
  /** The eyebrow over the display heading, as "DSAC" is on the registration screen. */
  eyebrow?: string;
  /** Two lines: the second is set in gold italic, as the design has it. */
  headline: ReactNode;
  lede: string;
  /** The small feature row along the bottom of the photograph. */
  features?: { icon: ReactNode; label: string }[];
  /** Shown top right, as the registration screen has it. */
  backHome?: boolean;
  children: ReactNode;
}

export function AuthShell({ eyebrow, headline, lede, features, backHome, children }: Props) {
  const { t, withLang } = useI18n();

  return (
    <div className="au">
      <header className="au-top">
        <Link to="/" className="au-dept">
          <span className="au-arms">
            <Arms size={44} />
          </span>
          <span className="au-dept-text">
            <strong>{t('dept.name')}</strong>
            {t('dept.line1')}
            <br />
            {t('dept.line2')}
            <br />
            <b>{t('dept.line3')}</b>
          </span>

          {/* The product's mark beside the Department's, as on the landing page. Decorative:
              the name is written beside it. */}
          <span className="au-brand">
            <img src="/img/vuka-logo.png" alt="" aria-hidden="true" width={52} height={42} draggable={false} />
            <span>Vuka</span>
          </span>
        </Link>

        <div className="au-top-right">
          <LanguagePicker />

          {backHome ? (
            <Link to="/" className="au-home">
              <IconHome size={17} />
              {t('nav.backHome')}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="au-split">
        <aside className="au-hero">
          <div className="au-hero-copy">
            {eyebrow ? <p className="au-eyebrow">{eyebrow}</p> : <span className="au-rule" aria-hidden="true" />}
            <h1 className="au-display">{headline}</h1>
            <p className="au-lede">{lede}</p>

            {features && features.length > 0 ? (
              <ul className="au-features">
                {features.map((f) => (
                  <li key={f.label}>
                    <span className="au-feature-icon">{f.icon}</span>
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </aside>

        <main className="au-panel">
          <div className="au-panel-inner">{children}</div>
        </main>
      </div>

      <footer className="au-foot">
        <p>
          &copy; {new Date().getFullYear()} {t('foot.rights')}
        </p>
        <nav className="au-foot-links" aria-label="Footer">
          {/* Into the Thymeleaf surface, carrying the chosen language so it opens in it. */}
          <a href={withLang('/public')}>{t('foot.privacy')}</a>
          <span aria-hidden="true">|</span>
          <a href={withLang('/public')}>{t('foot.terms')}</a>
          <span aria-hidden="true">|</span>
          <a href={withLang('/public')}>{t('foot.help')}</a>
        </nav>
      </footer>

      {/* Nobody is signed in on these screens, so Karabo answers from published data, as on the
          landing page. Same panel and questions as everywhere else. */}
      <AskKarabo />
    </div>
  );
}
