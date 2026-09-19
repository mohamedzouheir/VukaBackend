/*
 * The landing screen, from docs/Front End designs/.
 *
 * It sits in front of sign in: an unauthenticated visitor arrives here, not on a form. The two
 * cards on the right are the only routes onward, matching the design: sign in for DSAC staff,
 * sign up for entities.
 *
 * <h2>The two ways in</h2>
 *
 * A DSAC employee signs in with single sign on and reaches the dashboard without seeing a form at
 * all. An entity goes to the sign in screen, because an entity reporter is not in the
 * Department's directory and authenticates with an account the Department issued.
 *
 * There is no sign up. A reporter account carries the entity it may report for as a claim on its
 * token, and that claim is the whole tenancy model: somebody who could create their own account
 * and name their own entity could choose whose reporting they reach. Accounts are issued, so the
 * screen that would ask for one is not offered.
 *
 * <h2>Why this page looks nothing like the dashboard</h2>
 *
 * Deliberate, and it is in the design. This is the public face: serif display type, the
 * departmental green and gold, generous space. The dashboard behind it is a working tool: sans
 * type, navy rail, dense tables. Two audiences, two registers, one product.
 */
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { LanguagePicker } from '../components/LanguagePicker';
import { IconChevronRight, IconLandmark, IconShield, IconSpinner, IconUser } from '../icons';
import { Arms } from '../components/Arms';
import { AskKarabo } from '../components/AskKarabo';
import './Landing.css';

export function Landing() {
  const { signInAsDev, devAuth } = useAuth();
  const { t, withLang } = useI18n();
  const [pending, setPending] = useState(false);

  /*
   * Single sign on for departmental staff. In this build that is the development sign in with the
   * administrator role: federated sign in through Entra ID is not wired, and the Microsoft
   * integration here is a Graph client for SharePoint and Teams, which is documents rather than
   * identity. The note under the cards says so instead of letting the button imply otherwise.
   */
  async function employeeSso() {
    if (!devAuth) return;
    setPending(true);
    try {
      await signInAsDev('ADMIN', null, 'Thandi Mthembu');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="land">
      <header className="land-top">
        <div className="land-dept">
          <span className="land-arms">
            <Arms size={42} />
          </span>
          <span className="land-dept-text">
            <strong>{t('dept.name')}</strong>
            {t('dept.line1')}
            <br />
            {t('dept.line2')}
            <br />
            <b>{t('dept.line3')}</b>
          </span>

          {/* The product's mark beside the Department's: the arms say whose this is, the V says
              what it is called. The image is decorative, since the name is written beside it. */}
          <span className="land-brand">
            <img src="/img/vuka-logo.png" alt="" aria-hidden="true" width={52} height={42} draggable={false} />
            <span>Vuka</span>
          </span>
        </div>

        <div className="land-top-right">
          <LanguagePicker />
          {/* Carries the chosen language into the Thymeleaf surface, which serves the same five. */}
          <a className="land-lang" href={withLang('/public')}>
            {t('nav.citizenView')}
            <IconChevronRight size={15} />
          </a>
        </div>
      </header>

      <div className="land-hero">
        <div className="land-hero-inner">
          <div className="land-copy">
            <p className="land-eyebrow">
              <span>{t('land.eyebrow')}</span>
              <span className="land-rule" aria-hidden="true" />
            </p>

            <h1 className="land-display">
              {t('land.h1a')}
              <br />
              {t('land.h1b')}
              <br />
              <em>{t('land.h1c')}</em>
            </h1>

            <p className="land-lede">
{t('land.lede')}
            </p>
          </div>

          <div className="land-actions">
            {/* Departmental staff. Straight through to the dashboard, no form. */}
            <button
              type="button"
              className="land-card land-card-dark"
              onClick={() => void employeeSso()}
              disabled={pending || !devAuth}
              title={
                devAuth
                  ? t('land.ssoSub')
                  : t('land.ssoNotConfiguredSub')
              }
            >
              <span className="land-card-icon">
                {pending ? <IconSpinner size={22} className="spin" /> : <IconShield size={22} />}
              </span>
              <span className="land-card-text">
                <strong>{t('land.employee')}</strong>
                <em>
                  <b>SSO</b> {t('land.employeeSub')}
                </em>
              </span>
              <IconChevronRight size={20} />
            </button>

            {/* Reporting entities, who are not in the departmental directory. */}
            <Link to="/signin" className="land-card land-card-light">
              <span className="land-card-icon">
                <IconUser size={22} />
              </span>
              <span className="land-card-text">
                <strong>{t('land.signin')}</strong>
                <em>{t('land.signinSub')}</em>
              </span>
              <IconChevronRight size={20} />
            </Link>

            <p className="land-card-note">
              {devAuth
                ? t('land.ssoNote')
                : t('land.ssoNoteOff')}
            </p>
          </div>
        </div>
      </div>

      <section className="land-pillars">
        {[
          { title: t('land.pillar.creativity'), body: t('land.pillar.creativityBody') },
          { title: t('land.pillar.heritage'), body: t('land.pillar.heritageBody') },
          { title: t('land.pillar.sport'), body: t('land.pillar.sportBody') },
          { title: t('land.pillar.culture'), body: t('land.pillar.cultureBody') },
        ].map((p) => (
          <div className="land-pillar" key={p.title}>
            <span className="land-pillar-icon">
              <IconLandmark size={26} />
            </span>
            <div>
              <h2>{p.title}</h2>
              <p>{p.body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Answers from published data only, for a visitor who has not signed in. */}
      <AskKarabo />

      <footer className="land-quote">
        <blockquote>
          <p>{t('land.quote')}</p>
          <cite>Oliver Tambo</cite>
        </blockquote>
      </footer>
    </div>
  );
}
