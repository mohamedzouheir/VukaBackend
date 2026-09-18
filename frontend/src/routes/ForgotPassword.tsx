/*
 * Forgot password. Design only, and it says so on the screen.
 *
 * Nothing behind this is wired, deliberately. Firebase has a password reset flow and calling it
 * would take about ten lines, but a reset email that arrives from an unconfigured project, or
 * that does arrive and lands somebody on a page this build does not have, is worse than a screen
 * that is honest about being a design.
 *
 * The form still validates and still gives the response a real one would, which is the part
 * worth designing: a password reset must answer the same way whether or not the address is
 * registered. Saying "no account with that address" tells an attacker which addresses exist,
 * and this screen is the most common place that leak is introduced.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { useI18n } from '../lib/i18n';
import { IconAlert, IconArrowLeft, IconCheckCircle, IconShield, IconSpinner } from '../icons';
import './SignIn.css';
import './Register.css';

export function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    // No request. The pause is so the screen can be walked through as it would behave.
    window.setTimeout(() => {
      setPending(false);
      setSent(true);
    }, 500);
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
        <h2 className="si-title">{t('forgot.title')}</h2>
        <p className="si-sub">{t('forgot.sub')}</p>

        <p className="rg-notice">
          <IconAlert size={16} />
          <span>
            <strong>{t('forgot.designNote')}</strong> {t('forgot.designBody')}
            Wiring it is a small change once the Firebase project is configured.
          </span>
        </p>

        {sent ? (
          <div className="rg-done">
            <span className="rg-done-icon">
              <IconCheckCircle size={30} />
            </span>
            <h2>{t('forgot.sentTitle')}</h2>
            <p>
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
            </p>
            <p className="rg-note">
              The wording is deliberate. A reset screen has to answer the same way whether or not
              the address is registered, because confirming that an account exists is itself a
              disclosure about the person who holds it. This is the most common place that leak
              gets introduced.
            </p>
            <button type="button" className="rg-back" onClick={() => setSent(false)}>
              <IconArrowLeft size={16} />
              {t('forgot.again')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="si-field">
              <label htmlFor="reset-email">{t('signin.email')}</label>
              <div className="si-input">
                <span className="si-input-icon" aria-hidden="true">
                  <MailMark />
                </span>
                <input
                  id="reset-email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@dsac.gov.za"
                />
              </div>
            </div>

            <button type="submit" className="si-submit" disabled={pending || email.trim() === ''}>
              {pending ? <IconSpinner size={18} className="spin" /> : null}
              {t('forgot.submit')}
            </button>
          </form>
        )}

        <div className="si-contact">
          <p>{t('forgot.remembered')}</p>
          <Link to="/signin">{t('forgot.back')}</Link>
        </div>

        <p className="si-popia">
          <IconShield size={18} />
          <span>
{t('signin.popia')}
          </span>
        </p>
      </div>
    </AuthShell>
  );
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
