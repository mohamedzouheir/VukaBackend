/*
 * Template upload.
 *
 * UC-2. The file is parsed into ExtractionResult rows carrying the cell each value came
 * from, and no performance data is written. This screen exists mainly to say that out
 * loud before the reporter clicks, because the alternative reading is that uploading a
 * file files the figures, and that reading is what makes a parse error into a data error
 * with no way back.
 *
 * Three alternate flows from UC-2 are handled here rather than swallowed. A structure
 * mismatch shows the expected shape and offers the template again. A non numeric value
 * marks one row unparsed and lets the rest proceed. An indicator code that matches no
 * registered target is held aside and shown separately rather than silently dropped.
 */
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { ErrorState, Loading, NotFoundState } from '../components/Shell';
import { StateLine } from '../components/StateLine';
import type { ParseReport } from '../lib/types';
import { IconAlert, IconArrowLeft, IconCheckCircle, IconInfo, IconSpinner, IconUpload } from '../icons';

export function TemplateUpload() {
  const { t } = useI18n();
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();

  const detail = useAsync(() => api.submission(submissionId!), [submissionId]);

  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ParseReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setPending(true);
    setError(null);
    setReport(null);
    try {
      const res = await api.uploadTemplate(submissionId!, file);
      setReport(res);
    } catch (e) {
      // A rejected upload is the most likely thing to go wrong in a live demo, so the
      // message says what the parser expected rather than that something failed.
      setError(
        e instanceof Error
          ? e.message
          : t('upload.unreadable'),
      );
    } finally {
      setPending(false);
    }
  }

  if (detail.loading) return <Loading what={t('upload.what')} />;
  if (detail.notFound) return <NotFoundState what={t('common.submission')} />;
  if (detail.error) return <ErrorState message={detail.error} onRetry={detail.reload} />;

  const d = detail.data!;

  return (
    <div className="stack">
      <p>
        <Link to="/entity" className="row">
          <IconArrowLeft size={16} /> {d.entity.name}
        </Link>
      </p>

      <div className="section-head">
        <div>
          <h1>{t('upload.title')}</h1>
          <p className="muted">
            {t('upload.targetsRegistered', d.period.label, num(d.submission.targetCount) ?? '')}
          </p>
        </div>
      </div>

      {/* The sentence that has to be on the screen before the click, not after it. */}
      <p className="ind-note ind-note-plain">
        <IconInfo size={16} />
        <span>
          {t('upload.readsNote')}{' '}
          <strong>{t('upload.nothingWritten')}</strong> {t('upload.confirmNext')}
        </span>
      </p>

      <div className="card stack">
        <div>
          <label htmlFor="template">{t('upload.fileLabel')}</label>
          <input
            id="template"
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ref={input}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport(null);
              setError(null);
            }}
            aria-describedby="template-help"
          />
          <p className="small muted" id="template-help">
            {t('upload.help')}
          </p>
        </div>

        <div className="row">
          <button type="button" className="primary" disabled={!file || pending} onClick={() => void upload()}>
            {pending ? <IconSpinner size={16} className="spin" /> : <IconUpload size={16} />}
            {pending ? t('upload.reading') : t('upload.parse')}
          </button>
          {d.sourceDocument ? (
            <span className="small muted">
              {t('upload.lastRead', d.sourceDocument.fileName ?? t('upload.unnamed'))}
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="screen-state screen-state-error" role="alert">
            <IconAlert size={18} />
            <div>
              <p style={{ margin: 0 }}>{error}</p>
              <p className="small" style={{ marginBottom: 0 }}>
                {t('upload.parserHint')}
              </p>
            </div>
          </div>
        ) : null}

        {report ? (
          <div className="card card-sunk stack-tight">
            <p className="row" style={{ margin: 0 }}>
              <IconCheckCircle size={18} />
              <strong>
                {t('upload.rowsRead', num(report.rowsRead) ?? '', num(report.matched) ?? '')}
              </strong>
            </p>
            {report.unmatched > 0 ? (
              <p className="small" style={{ margin: 0 }}>
                {t(
                  'upload.unmatched',
                  report.unmatched === 1
                    ? t('upload.oneRow')
                    : t('upload.nRows', num(report.unmatched) ?? ''),
                )}{' '}
                {t('upload.heldAside')}
              </p>
            ) : null}
            <p className="small muted" style={{ margin: 0 }}>
              {t('upload.notPerformanceYet')}
            </p>
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => navigate('/entity/submission/' + submissionId + '/review')}
              >
                {t('upload.reviewRead')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <StateLine
        status={d.submission.status}
        viewer="ENTITY_REPORTER"
        outstanding={d.submission.targetCount - d.submission.confirmedCount}
      />
    </div>
  );
}
