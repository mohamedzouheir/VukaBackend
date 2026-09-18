/*
 * Entity Registration, from the screenshot in docs/Front End designs/.
 *
 * Four steps: organisation details, contact details, supporting documents, review and submit.
 * Photograph left with the benefits row, wizard right on cream.
 *
 * <h2>This registers an organisation, not a user account</h2>
 *
 * Worth being exact, because the distinction is the security model rather than a wording
 * preference. A reporter's account carries the entity it may report for as a claim on its signed
 * token, and that claim is what stops one entity reading another's reporting. If a person could
 * create their own account and name their own entity, they could choose whose data they reach.
 *
 * So this is an application to be onboarded: it collects who the organisation is and who speaks
 * for it, and the Department decides. No password is chosen here. The account and its entity
 * claim are issued afterwards, by an administrator, through tools/ProvisionUsers.java.
 *
 * <h2>Not connected</h2>
 *
 * Nothing is submitted. There is no onboarding endpoint and building one would mean deciding who
 * at the Department receives an application and what happens to it, which is a departmental
 * process question rather than a screen. The review step says so before the button rather than
 * after it.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { useI18n } from '../lib/i18n';
import type { I18n, Key } from '../lib/i18n';
import {
  IconAlert, IconArrowLeft, IconCheck, IconCheckCircle, IconLandmark, IconPaperclip,
  IconSpinner, IconUser, IconWorkspaces,
} from '../icons';
import './Register.css';

const STEP_KEYS: Key[] = ['register.step1', 'register.step2', 'register.step3', 'register.step4'];

/* The sector names the rest of the application uses, so an applicant and a reviewer name the
   same thing the same way. Entity types and provinces below stay as written: a PFMA schedule
   and a province are proper names, not vocabulary. */
const SECTOR_KEYS: Key[] = [
  'sector.arts',
  'sector.heritage',
  'sector.sport',
  'sector.libraries',
  'sector.language',
  'sector.other',
];
const ENTITY_TYPES = ['Public entity, Schedule 3A', 'Public entity, Schedule 3B', 'Non-profit organisation', 'Other'];
const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
];

interface Form {
  organisation: string;
  registrationNumber: string;
  entityType: string;
  sector: string;
  address: string;
  province: string;
  postalCode: string;
  contactNumber: string;
  website: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
}

const EMPTY: Form = {
  organisation: '', registrationNumber: '', entityType: '', sector: '', address: '',
  province: '', postalCode: '', contactNumber: '', website: '',
  contactName: '', contactRole: '', contactEmail: '', contactPhone: '',
};

export function Register() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  function set(field: keyof Form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function blur(field: keyof Form) {
    return () => setTouched((t) => ({ ...t, [field]: true }));
  }

  const problems = validate(form, step, t);
  const stepValid = Object.keys(problems).length === 0;

  function next() {
    // Mark this step's fields touched so anything missing is named rather than the button
    // simply refusing and leaving the person to guess which one.
    const fields = step === 0 ? STEP_ONE_FIELDS : step === 1 ? STEP_TWO_FIELDS : [];
    setTouched((t) => ({ ...t, ...Object.fromEntries(fields.map((f) => [f, true])) }));
    if (!stepValid) return;
    setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1));
  }

  function submit() {
    setPending(true);
    window.setTimeout(() => {
      setPending(false);
      setDone(true);
    }, 600);
  }

  function err(field: keyof Form) {
    return touched[field] ? problems[field] : undefined;
  }

  return (
    <AuthShell
      backHome
      eyebrow="DSAC"
      headline={
        <>
          {t('register.headline1')}
          <br />
          {t('register.headline2')}
          <em>{t('register.headlineEm')}</em>
        </>
      }
      lede={t('register.lede')}
      features={[
        { icon: <IconWorkspaces size={24} />, label: t('register.feature1') },
        { icon: <IconLandmark size={24} />, label: t('register.feature2') },
        { icon: <IconCheckCircle size={24} />, label: t('register.feature3') },
        { icon: <IconUser size={24} />, label: t('register.feature4') },
      ]}
    >
      <div className="rg">
        <ol className="rg-steps" aria-label={t('register.progress')}>
          {STEP_KEYS.map((key, i) => (
            <li key={key} className={i === step ? 'rg-step-on' : i < step ? 'rg-step-done' : undefined}>
              <span className="rg-step-mark" aria-hidden="true">
                {i < step ? <IconCheck size={15} /> : i + 1}
              </span>
              <span className="rg-step-label">{t(key)}</span>
            </li>
          ))}
        </ol>

        {done ? (
          <div className="rg-done">
            <span className="rg-done-icon">
              <IconCheckCircle size={30} />
            </span>
            <h2>{t('register.receivedTitle')}</h2>
            <p>
              {t('register.receivedBody')}
            </p>
            <p className="rg-note">
              {t('register.receivedNote')}
            </p>
            <Link className="rg-next" to="/signin">
              {t('register.backToSignIn')}
            </Link>
          </div>
        ) : (
          <>
            <h2 className="rg-title">{t('register.title')}</h2>
            <p className="rg-sub">{t('register.sub')}</p>

            <p className="rg-notice">
              <IconAlert size={16} />
              <span>
                <strong>{t('register.designHead')}</strong> {t('register.designBody')}
              </span>
            </p>

            {step === 0 ? (
              <Section icon={<IconLandmark size={20} />} title={t('register.orgInfo')}>
                <div className="rg-grid">
                  <Field label={t('register.orgName')} required error={err('organisation')}>
                    <input
                      value={form.organisation}
                      onChange={set('organisation')}
                      onBlur={blur('organisation')}
                      placeholder={t('register.phOrganisation')}
                    />
                  </Field>
                  <Field label={t('register.regNumber')}>
                    <input
                      value={form.registrationNumber}
                      onChange={set('registrationNumber')}
                      placeholder={t('register.phRegNumber')}
                    />
                  </Field>
                  <Field label={t('register.entityType')} required error={err('entityType')}>
                    <select value={form.entityType} onChange={set('entityType')} onBlur={blur('entityType')}>
                      <option value="">{t('register.selectEntityType')}</option>
                      {ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('register.sector')} required error={err('sector')}>
                    <select value={form.sector} onChange={set('sector')} onBlur={blur('sector')}>
                      <option value="">{t('register.selectSector')}</option>
                      {SECTOR_KEYS.map((key) => (
                        <option key={key} value={t(key)}>
                          {t(key)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('register.address')} required error={err('address')}>
                    <input
                      value={form.address}
                      onChange={set('address')}
                      onBlur={blur('address')}
                      placeholder={t('register.phAddress')}
                    />
                  </Field>
                  <Field label={t('register.province')} required error={err('province')}>
                    <select value={form.province} onChange={set('province')} onBlur={blur('province')}>
                      <option value="">{t('register.selectProvince')}</option>
                      {PROVINCES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('register.postalCode')} required error={err('postalCode')}>
                    <input
                      value={form.postalCode}
                      onChange={set('postalCode')}
                      onBlur={blur('postalCode')}
                      inputMode="numeric"
                      placeholder={t('register.phPostalCode')}
                    />
                  </Field>
                  <Field label={t('register.contactNumber')} required error={err('contactNumber')}>
                    <input
                      value={form.contactNumber}
                      onChange={set('contactNumber')}
                      onBlur={blur('contactNumber')}
                      inputMode="tel"
                      placeholder={t('register.phContactNumber')}
                    />
                  </Field>
                  <Field label={t('register.website')} wide>
                    <input
                      value={form.website}
                      onChange={set('website')}
                      placeholder={t('register.phWebsite')}
                    />
                  </Field>
                </div>
              </Section>
            ) : null}

            {step === 1 ? (
              <Section icon={<IconUser size={20} />} title={t('register.step2')}>
                <div className="rg-grid">
                  <Field label={t('register.fullName')} required error={err('contactName')}>
                    <input
                      value={form.contactName}
                      onChange={set('contactName')}
                      onBlur={blur('contactName')}
                      placeholder={t('register.phFullName')}
                    />
                  </Field>
                  <Field label={t('register.role')} required error={err('contactRole')}>
                    <input
                      value={form.contactRole}
                      onChange={set('contactRole')}
                      onBlur={blur('contactRole')}
                      placeholder={t('register.phRole')}
                    />
                  </Field>
                  <Field label={t('register.workEmail')} required error={err('contactEmail')}>
                    <input
                      type="email"
                      inputMode="email"
                      value={form.contactEmail}
                      onChange={set('contactEmail')}
                      onBlur={blur('contactEmail')}
                      placeholder={t('register.phWorkEmail')}
                    />
                  </Field>
                  <Field label={t('register.contactNumberLabel')} required error={err('contactPhone')}>
                    <input
                      value={form.contactPhone}
                      onChange={set('contactPhone')}
                      onBlur={blur('contactPhone')}
                      inputMode="tel"
                      placeholder={t('register.phMobile')}
                    />
                  </Field>
                </div>
                <p className="rg-help">
                  {t('register.noPasswordHere')}
                </p>
              </Section>
            ) : null}

            {step === 2 ? (
              <Section icon={<IconPaperclip size={20} />} title={t('register.step3')}>
                <div className="rg-docs">
                  {(['register.doc1', 'register.doc2', 'register.doc3', 'register.doc4'] as Key[]).map((d) => (
                    <div className="rg-doc" key={d}>
                      <span className="rg-doc-icon">
                        <IconPaperclip size={17} />
                      </span>
                      <div>
                        <strong>{t(d)}</strong>
                        <span>{t('register.docHint')}</span>
                      </div>
                      <button type="button" className="rg-doc-btn" disabled>
                        {t('register.chooseFile')}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="rg-help">
                  {t('register.uploadDisabled')}
                </p>
              </Section>
            ) : null}

            {step === 3 ? (
              <Section icon={<IconCheckCircle size={20} />} title={t('register.step4')}>
                <dl className="rg-review">
                  <Review label={t('register.reviewOrganisation')} value={form.organisation} />
                  <Review label={t('register.reviewRegNumber')} value={form.registrationNumber} />
                  <Review label={t('register.reviewEntityType')} value={form.entityType} />
                  <Review label={t('register.reviewSector')} value={form.sector} />
                  <Review label={t('register.reviewAddress')} value={[form.address, form.province, form.postalCode].filter(Boolean).join(', ')} />
                  <Review label={t('register.reviewMainNumber')} value={form.contactNumber} />
                  <Review label={t('register.reviewWebsite')} value={form.website} />
                  <Review label={t('register.reviewContact')} value={[form.contactName, form.contactRole].filter(Boolean).join(', ')} />
                  <Review label={t('register.reviewEmail')} value={form.contactEmail} />
                  <Review label={t('register.reviewNumber')} value={form.contactPhone} />
                </dl>
                <p className="rg-help">
                  {t('register.submitNote')}
                </p>
              </Section>
            ) : null}

            <div className="rg-actions">
              {step === 0 ? (
                <Link className="rg-back" to="/">
                  <IconArrowLeft size={16} />
                  {t('common.cancel')}
                </Link>
              ) : (
                <button type="button" className="rg-back" onClick={() => setStep((s) => s - 1)}>
                  <IconArrowLeft size={16} />
                  {t('common.back')}
                </button>
              )}

              {step < STEP_KEYS.length - 1 ? (
                <button type="button" className="rg-next" onClick={next}>
                  {t('register.nextStep', t(STEP_KEYS[step + 1]))}
                  <IconArrowLeft size={16} className="rg-next-arrow" />
                </button>
              ) : (
                <button type="button" className="rg-next" onClick={submit} disabled={pending}>
                  {pending ? <IconSpinner size={16} className="spin" /> : null}
                  {t('register.submitApplication')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rg-section">
      <h3 className="rg-section-head">
        <span className="rg-section-icon">{icon}</span>
        {title}
        <span className="rg-section-rule" aria-hidden="true" />
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  error,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const id = 'f-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className={'rg-field' + (wide ? ' rg-field-wide' : '') + (error ? ' rg-field-bad' : '')}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="rg-req" aria-hidden="true"> *</span> : null}
        {required ? <span className="visually-hidden"> required</span> : null}
      </label>
      {/* The control is cloned so the label's htmlFor and the error's aria-describedby land on it
          without every caller having to repeat the wiring. */}
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': error ? id + '-err' : undefined,
          })
        : children}
      {error ? (
        <p className="rg-err" id={id + '-err'}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      {/* Absent is stated rather than left blank, which reads as a rendering fault. */}
      <dd className={value ? undefined : 'rg-review-empty'}>{value || 'Not given'}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STEP_ONE_FIELDS: (keyof Form)[] = [
  'organisation', 'entityType', 'sector', 'address', 'province', 'postalCode', 'contactNumber',
];
const STEP_TWO_FIELDS: (keyof Form)[] = ['contactName', 'contactRole', 'contactEmail', 'contactPhone'];

/** Only the step on screen is validated, so a later step's gaps are not thrown at somebody early. */
function validate(
  form: Form,
  step: number,
  t: I18n['t'],
): Partial<Record<keyof Form, string>> {
  const out: Partial<Record<keyof Form, string>> = {};

  if (step === 0) {
    if (!form.organisation.trim()) out.organisation = t('register.errOrganisation');
    if (!form.entityType) out.entityType = t('register.errEntityType');
    if (!form.sector) out.sector = t('register.errSector');
    if (!form.address.trim()) out.address = t('register.errAddress');
    if (!form.province) out.province = t('register.errProvince');
    if (!/^\d{4}$/.test(form.postalCode.trim())) out.postalCode = t('register.errPostalCode');
    if (!phoneOk(form.contactNumber)) out.contactNumber = t('register.errPhone');
  }

  if (step === 1) {
    if (!form.contactName.trim()) out.contactName = t('register.errContactName');
    if (!form.contactRole.trim()) out.contactRole = t('register.errContactRole');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      out.contactEmail = t('register.errWorkEmail');
    }
    if (!phoneOk(form.contactPhone)) out.contactPhone = t('register.errPhone');
  }

  return out;
}

/** Spaces, brackets and dashes are how people actually write a number, so they are stripped. */
function phoneOk(value: string): boolean {
  return /^\d{10}$/.test(value.replace(/[\s()+-]/g, '').replace(/^27/, '0'));
}

