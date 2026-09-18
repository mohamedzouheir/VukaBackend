/*
 * Sign in, from the screenshot in docs/Front End designs/.
 *
 * Photograph left carrying "Culture. Heritage. / Our Future.", form right on cream: email,
 * password with a reveal, remember me against forgot password, a full width dark green button,
 * the contact line and the POPIA notice.
 *
 * <h2>What the screenshot does not have, and why these are here anyway</h2>
 *
 * Two additions, both demonstration affordances, both labelled as such.
 *
 * The employee button, because the Department runs on Microsoft 365 and somebody will ask how
 * staff get in. It does not federate: nothing in this system does. The Microsoft integration is
 * a Graph client for SharePoint and Teams, which is documents rather than identity. In
 * demonstration mode it signs in with the administrator role and the caption says exactly that.
 *
 * The seeded accounts, which only render where the development sign in is enabled, because they
 * print working passwords and credentials do not belong on a page that might be real.
 *
 * <h2>POPIA</h2>
 *
 * The notice at the foot is in the screenshot and it is also correct, which is worth saying
 * because it is the kind of line that usually is not. POPIA attaches to personal information,
 * and on this screen that is exactly what is being collected: an email address and a password
 * belonging to a named official. The performance data behind the sign in is not personal
 * information and the notice does not claim it is.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import type { Role } from '../lib/types';
import { AuthShell } from '../components/AuthShell';
import {
  IconAlert, IconArrowLeft, IconEye, IconEyeOff, IconLock, IconShield, IconSpinner, IconUser,
} from '../icons';
import './SignIn.css';

const DEMO_ACCOUNTS: {
  role: Role;
  label: string;
  email: string;
  password: string;
  name: string;
  what: Key;
}[] = [
  {
    role: 'DSAC_REVIEWER',
    label: 'DSAC reviewer',
    email: 'reviewer@dsac.gov.za',
    password: 'Vuka2026!',
    name: 'L. Dlamini',
    what: 'signin.demoReviewer',
  },
  {
    role: 'DSAC_EXECUTIVE',
    label: 'DSAC executive',
    email: 'dg@dsac.gov.za',
    password: 'Vuka2026!',
    name: 'Director-General',
    what: 'signin.demoExecutive',
  },
  {
    role: 'ADMIN',
    label: 'Administrator',
    email: 'admin@dsac.gov.za',
    password: 'Vuka2026!',
    name: 'System administrator',
    what: 'signin.demoAdmin',
  },
  {
    role: 'ENTITY_REPORTER',
    label: 'Entity reporter',
    email: 'nomsa@iziko.org.za',
    password: 'Vuka2026!',
    name: 'N. Mabaso',
    what: 'signin.demoReporter',
  },
];

/** Iziko, which the wireframes use and which carries twenty registered targets. */
const DEMO_ENTITY_ID = '7594b805-3ea9-49ec-a124-852adc5a86c0';

export function SignIn() {
  const { signIn, signInAsDev, devAuth, error: authError } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* A field is not wrong until the person has finished with it. */
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});

  const emailProblem = validateEmail(email, t);
  const passwordProblem = password === '' ? t('signin.passwordMissing') : null;
  const valid = !emailProblem && !passwordProblem;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!valid) return;

    setPending('form');
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch {
      // Firebase distinguishes a wrong password from an unknown account. Repeating that back
      // tells an attacker which addresses are registered, so both land on one message.
      setError(t('signin.wrong'));
    } finally {
      setPending(null);
    }
  }

  async function employeeSso() {
    if (!devAuth) return;
    setPending('sso');
    setError(null);
    try {
      await signInAsDev('ADMIN', null, 'Thandi Mthembu');
    } finally {
      setPending(null);
    }
  }

  async function useDemo(a: (typeof DEMO_ACCOUNTS)[number]) {
    setError(null);
    if (devAuth) {
      setPending(a.role);
      try {
        await signInAsDev(a.role, a.role === 'ENTITY_REPORTER' ? DEMO_ENTITY_ID : null, a.name);
      } finally {
        setPending(null);
      }
      return;
    }
    // Firebase is configured, so fill the form rather than bypassing it: the account exists and
    // the real sign in is one click away, which demonstrates more than a shortcut would.
    setEmail(a.email);
    setPassword(a.password);
    setTouched({});
  }

  return (
    <AuthShell
      headline={
        <>
          {t('auth.h1a')}
          <em>{t('auth.h1b')}</em>
        </>
      }
      lede={t('auth.lede')}
    >
      <div className="si">
        <span className="si-rule" aria-hidden="true" />
        <h2 className="si-title">{t('signin.title')}</h2>
        <p className="si-sub">{t('signin.sub')}</p>

        {authError ? (
          <p className="si-alert" role="alert">
            <IconAlert size={16} />
            <span>{authError}</span>
          </p>
        ) : null}

        <form onSubmit={submit} noValidate>
          <div className="si-field">
            <label htmlFor="email">{t('signin.email')}</label>
            <div className={'si-input' + (touched.email && emailProblem ? ' si-input-bad' : '')}>
              <span className="si-input-icon" aria-hidden="true">
                <MailMark />
              </span>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="name@dsac.gov.za"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                aria-invalid={touched.email && emailProblem ? true : undefined}
                aria-describedby={touched.email && emailProblem ? 'email-err' : undefined}
              />
            </div>
            {touched.email && emailProblem ? (
              <p className="si-err" id="email-err">
                {emailProblem}
              </p>
            ) : null}
          </div>

          <div className="si-field">
            <label htmlFor="password">{t('signin.password')}</label>
            <div className={'si-input' + (touched.password && passwordProblem ? ' si-input-bad' : '')}>
              <span className="si-input-icon" aria-hidden="true">
                <IconLock size={17} />
              </span>
              <input
                id="password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t('signin.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                aria-invalid={(touched.password && passwordProblem) || error ? true : undefined}
                aria-describedby={
                  touched.password && passwordProblem ? 'password-err' : error ? 'signin-err' : undefined
                }
              />
              <button
                type="button"
                className="si-reveal"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? t('signin.hidePassword') : t('signin.showPassword')}
              >
                {reveal ? <IconEyeOff size={17} /> : <IconEye size={17} />}
              </button>
            </div>
            {touched.password && passwordProblem ? (
              <p className="si-err" id="password-err">
                {passwordProblem}
              </p>
            ) : null}
            {error ? (
              <p className="si-err" id="signin-err">
                {error}
              </p>
            ) : null}
          </div>

          <div className="si-row">
            <label className="si-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>{t('signin.remember')}</span>
            </label>
            <Link to="/forgot-password" className="si-link">
              {t('signin.forgot')}
            </Link>
          </div>

          <button type="submit" className="si-submit" disabled={pending !== null}>
            {pending === 'form' ? <IconSpinner size={18} className="spin" /> : null}
            {t('signin.submit')}
            {pending === 'form' ? null : <IconArrowLeft size={18} className="si-submit-arrow" />}
          </button>
        </form>

        {/* Departmental staff. Not in the screenshot, and the caption says what it is. */}
        <div className="si-or">
          <span>{t('signin.or')}</span>
        </div>

        <button
          type="button"
          className="si-sso"
          onClick={() => void employeeSso()}
          disabled={!devAuth || pending !== null}
        >
          {pending === 'sso' ? <IconSpinner size={18} className="spin" /> : <IconShield size={18} />}
          <span>
            {t('signin.employee')}
            <b className="si-sso-tag">SSO</b>
          </span>
        </button>
        <p className="si-sso-note">
          {devAuth ? t('signin.ssoNote') : t('signin.ssoNotConfigured')}
        </p>

        <div className="si-contact">
          <p>{t('signin.noAccount')}</p>
          <a href="/public">{t('signin.contact')}</a>
        </div>

        <p className="si-popia">
          <IconShield size={18} />
          <span>
{t('signin.popia')}
          </span>
        </p>

        {devAuth ? (
          <section className="si-demo">
            <div className="si-demo-head">
              <IconAlert size={15} />
              <div>
                <strong>{t('signin.demoHead')}</strong>
                <p>{t('signin.demoSub')}</p>
              </div>
            </div>
            <div className="si-demo-grid">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.role}
                  type="button"
                  className="si-demo-card"
                  onClick={() => void useDemo(a)}
                  disabled={pending !== null}
                >
                  <span className="si-demo-role">
                    {pending === a.role ? <IconSpinner size={13} className="spin" /> : <IconUser size={13} />}
                    {a.label}
                  </span>
                  <span className="si-demo-what">{t(a.what)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AuthShell>
  );
}

/**
 * Deliberately loose. The authoritative check is whether an account exists, and a stricter
 * pattern here only ever rejects somebody's real address.
 */
function validateEmail(value: string, t: (k: 'signin.emailMissing' | 'signin.emailBad') => string): string | null {
  const v = value.trim();
  if (v === '') return t('signin.emailMissing');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return t('signin.emailBad');
  return null;
}

/** An envelope, matching the field icon in the screenshot. */
function MailMark() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}
