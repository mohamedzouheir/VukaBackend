/*
 * The language control.
 *
 * A native select rather than a styled dropdown, on purpose. A select gets keyboard handling,
 * screen reader announcement and the platform's own picker on a phone for nothing, and every
 * hand-built version of this control has to reimplement all three and usually reimplements two.
 * The chevron and the globe are drawn around it; the control underneath is the real thing.
 *
 * Each language is named in itself. Listing "Zulu" in English on a South African government
 * service would be the wrong call.
 */
import { LANGUAGES, useI18n } from '../lib/i18n';
import type { Lang } from '../lib/i18n';
import { IconChevronDown } from '../icons';
import './LanguagePicker.css';

export function LanguagePicker({ compact }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();

  return (
    <span className={'lang' + (compact ? ' lang-compact' : '')}>
      <span className="lang-globe" aria-hidden="true">
        <GlobeMark />
      </span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label={t('nav.language')}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <span className="lang-chevron" aria-hidden="true">
        <IconChevronDown size={15} />
      </span>
    </span>
  );
}

function GlobeMark() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
    </svg>
  );
}
