/*
 * A quarter's evidence in one go.
 *
 * The single-file drawer asks three questions per file: which file, which indicator, which test.
 * With twenty indicators and two or three files each, that is fifty trips through a dialog, and
 * the reporter already answered two of the three questions when they named the file. This reads
 * the answers out of the name, shows every guess in one table, and asks only about the files it
 * could not place.
 *
 * Nothing is attached on a guess alone. The table is the confirmation, and a file with no
 * indicator or no test is held back rather than attached as a file in a folder, which is the
 * thing the criterion exists to prevent.
 *
 * Each file goes through the same endpoint as the drawer, one at a time, so storage, versioning
 * and receipts are exactly what a single attach produces.
 */
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { guessCriterion, matchIndicator, RELIABILITY, type Criterion } from '../lib/evidenceMatch';
import { fileSize, num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { I18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import type { IndicatorRowView } from '../lib/types';
import { Modal } from './Shell';
import { IconAlert, IconCheck, IconPaperclip, IconSpinner, IconUpload, IconX } from '../icons';
import './BulkEvidence.css';

/** The backend's multipart limit. A file over it is refused here rather than failing mid-batch. */
const MAX_BYTES = 15 * 1024 * 1024;

interface Item {
  key: string;
  file: File;
  targetId: string;
  criterion: Criterion | '';
  /** Why the indicator was not filled in, where it was not. */
  why: string | null;
  state: 'waiting' | 'sending' | 'attached' | 'failed';
  error: string | null;
  /** Refused before sending, so trying again cannot help. A failure in transit can be retried. */
  refused: boolean;
}

function toItem(file: File, rows: IndicatorRowView[], t: I18n['t']): Item {
  const match = matchIndicator(file.name, rows);
  const tooBig = file.size > MAX_BYTES;
  return {
    key: file.name + ':' + file.size + ':' + file.lastModified,
    file,
    targetId: match.row?.targetId ?? '',
    criterion: guessCriterion(file.name) ?? '',
    why: match.row
      ? null
      : match.candidates.length > 1
        ? t('be.whyAmbiguous', match.candidates.map((r) => r.indicatorRef).join(t('be.and')))
        : t('be.whyNoCode'),
    state: tooBig ? 'failed' : 'waiting',
    error: tooBig ? t('be.tooBig') : null,
    refused: tooBig,
  };
}

export function BulkEvidence({
  submissionId,
  rows,
  onClose,
}: {
  submissionId: string;
  rows: IndicatorRowView[];
  /** Called with whether anything was attached, so the screen only reloads when it changed. */
  onClose: (attachedAny: boolean) => void;
}) {
  const { t } = useI18n();
  const L = useLabels();
  const [items, setItems] = useState<Item[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const attachedAny = useRef(false);

  function add(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files).map((f) => toItem(f, rows, t));
    setItems((current) => {
      // The same file dropped twice is one file.
      const held = new Set(current.map((i) => i.key));
      return [...current, ...incoming.filter((i) => !held.has(i.key))];
    });
  }

  function update(key: string, change: Partial<Item>) {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }

  const pending = items.filter((i) => i.state === 'waiting' || (i.state === 'failed' && !i.refused));
  const ready = pending.filter((i) => i.targetId && i.criterion);
  const unplaced = pending.filter((i) => !i.targetId || !i.criterion);
  const attached = items.filter((i) => i.state === 'attached');

  async function attachAll() {
    setSending(true);
    for (const item of ready) {
      update(item.key, { state: 'sending', error: null });
      try {
        await api.attachEvidence(submissionId, item.targetId, item.file, [item.criterion as Criterion]);
        attachedAny.current = true;
        update(item.key, { state: 'attached' });
      } catch (e) {
        update(item.key, {
          state: 'failed',
          error: e instanceof Error ? e.message : t('be.notStored'),
        });
      }
    }
    setSending(false);
  }

  const close = () => {
    if (!sending) onClose(attachedAny.current);
  };

  return (
    <Modal
      wide
      title={t('be.title')}
      onClose={close}
      footer={
        <>
          <span className="small muted be-tally">
            {items.length === 0
              ? null
              : t('be.ready', num(ready.length) ?? '') +
                (unplaced.length ? ', ' + t('be.needChoice', num(unplaced.length) ?? '') : '') +
                (attached.length ? ', ' + t('be.attachedCount', num(attached.length) ?? '') : '')}
          </span>
          <button type="button" onClick={close} disabled={sending}>
            {attached.length > 0 && ready.length === 0 ? t('common.done') : t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={sending || ready.length === 0}
            onClick={() => void attachAll()}
          >
            {sending ? <IconSpinner size={16} className="spin" /> : <IconPaperclip size={16} />}
            {ready.length === 1 ? t('be.attachOne') : t('be.attachMany', num(ready.length) ?? '')}
          </button>
        </>
      }
    >
      <label
        className={'be-drop' + (dragging ? ' be-drop-over' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
      >
        <IconUpload size={22} />
        <span>
          <strong>{t('be.dropHead')}</strong>{t('be.dropOr')}
          <span className="small muted be-hint">
            {t('be.hint1')}{' '}
            <span className="mono">HER-1.1 signed attendance register.pdf</span>{t('be.hint2')}
          </span>
        </span>
        <input
          type="file"
          multiple
          className="visually-hidden"
          onChange={(e) => {
            add(e.target.files);
            // Cleared so choosing the same file again after removing it still fires.
            e.target.value = '';
          }}
        />
      </label>

      {items.length > 0 ? (
        <div className="table-wrap">
          <table className="be-table">
            <thead>
              <tr>
                <th>{t('be.colFile')}</th>
                <th>{t('be.colIndicator')}</th>
                <th>{t('be.colTest')}</th>
                <th>
                  <span className="visually-hidden">{t('be.colState')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const locked = item.state === 'sending' || item.state === 'attached' || item.refused || sending;
                return (
                  <tr key={item.key} className={item.state === 'attached' ? 'be-done' : undefined}>
                    <td>
                      <span className="be-name">{item.file.name}</span>
                      <span className="small muted">{fileSize(item.file.size)}</span>
                    </td>
                    <td>
                      <select
                        aria-label={t('be.indicatorFor', item.file.name)}
                        value={item.targetId}
                        disabled={locked}
                        onChange={(e) => update(item.key, { targetId: e.target.value })}
                      >
                        <option value="">{t('be.chooseIndicator')}</option>
                        {rows.map((r) => (
                          <option key={r.targetId} value={r.targetId}>
                            {r.indicatorRef} {r.indicator}
                          </option>
                        ))}
                      </select>
                      {!item.targetId && item.why ? (
                        <span className="small be-why">{item.why}</span>
                      ) : null}
                    </td>
                    <td>
                      <select
                        aria-label={t('be.testFor', item.file.name)}
                        value={item.criterion}
                        disabled={locked}
                        title={item.criterion ? L.criterionText(item.criterion) : undefined}
                        onChange={(e) => update(item.key, { criterion: e.target.value as Criterion | '' })}
                      >
                        <option value="">{t('be.chooseTest')}</option>
                        {RELIABILITY.map((c) => (
                          <option key={c.key} value={c.key}>
                            {L.criterion(c.key)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="be-state">
                      {item.state === 'sending' ? (
                        <IconSpinner size={16} className="spin" />
                      ) : item.state === 'attached' ? (
                        <span className="be-ok">
                          <IconCheck size={16} /> {t('be.attached')}
                        </span>
                      ) : item.state === 'failed' ? (
                        <span className="be-fail">
                          <IconAlert size={16} /> {item.error}
                        </span>
                      ) : null}
                      {item.state === 'waiting' || item.state === 'failed' ? (
                        <button
                          type="button"
                          className="be-remove"
                          disabled={sending}
                          onClick={() => setItems((c) => c.filter((i) => i.key !== item.key))}
                        >
                          <IconX size={14} />
                          <span className="visually-hidden">{t('be.remove', item.file.name)}</span>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {unplaced.length > 0 ? (
        <p className="small muted">
          {t('be.heldBack')}
        </p>
      ) : null}
    </Modal>
  );
}
