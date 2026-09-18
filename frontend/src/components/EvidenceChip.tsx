/*
 * EvidenceChip. Component 5 of nine. Three states, one component.
 *
 * The distinction this component exists to carry is unverifiable against unverified.
 * That is the Auditor-General's own language and it is the distinction the department
 * cares about: a figure with no evidence attached cannot be checked at all, which is a
 * different and worse thing than a figure nobody has got round to checking.
 *
 * It also names the test being satisfied rather than saying "attach a document". Evidence
 * is tagged with the AGSA criterion it satisfies, which is the whole difference between a
 * document repository and an audit readiness tool.
 */
import { IconAlert, IconExternal, IconPaperclip, IconShield } from '../icons';
import { criterionLabel, fileSize } from '../lib/format';
import type { EvidenceView } from '../lib/types';
import './components.css';
import { openFile } from '../lib/api';

interface Props {
  evidence: EvidenceView[];
  /** The criteria the attached evidence satisfies, as stored. */
  agsaCriteria: string[];
  traceable: boolean;
  /** Absent hides the control, which is how the denied state renders. */
  onAttach?: () => void;
  /** Builds a URL for one stored document. Absent leaves the names unopenable. */
  documentUrl?: (documentId: string) => string;
  /** True where the caller may see the count but not open the files. */
  countOnly?: boolean;
  loading?: boolean;
  error?: string | null;
}

export function EvidenceChip({
  evidence,
  agsaCriteria,
  traceable,
  onAttach,
  documentUrl,
  countOnly,
  loading,
  error,
}: Props) {
  if (loading) {
    return (
      <span className="ev" aria-hidden="true">
        <IconPaperclip size={15} />
        <span className="skeleton" style={{ width: '4rem', height: '0.85rem' }} />
      </span>
    );
  }

  // Error. The count is shown and the link is disabled with a reason, rather than the
  // component disappearing and leaving the reader unsure whether evidence exists.
  if (error) {
    return (
      <span className="ev ev-warn">
        <IconAlert size={15} />
        <span>
          {evidence.length} {evidence.length === 1 ? 'file' : 'files'} on record. Could not read the
          document store, so they cannot be opened here.
        </span>
      </span>
    );
  }

  // Empty, and it is the state that carries the argument.
  if (evidence.length === 0) {
    return (
      <span className="ev ev-warn">
        <IconAlert size={15} />
        <span>
          No evidence attached. This figure will show to the Department as{' '}
          <strong>unverifiable</strong>, which is different from unverified.
        </span>
        {onAttach ? (
          <button type="button" className="link" onClick={onAttach}>
            attach
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <span className={'ev' + (traceable ? ' ev-ok' : '')}>
      {traceable ? <IconShield size={15} /> : <IconPaperclip size={15} />}

      <span className="ev-files">
        {evidence.map((d) =>
          documentUrl && !countOnly ? (
            <a
              key={d.documentId}
              className="ev-file"
              href={documentUrl(d.documentId)}
              onClick={(e) => openFile(e, documentUrl(d.documentId), d.fileName ?? 'evidence')}
              title={[d.uploadedByName, fileSize(d.sizeBytes)].filter(Boolean).join(', ')}
            >
              {d.fileName ?? 'Unnamed file'}
              <IconExternal size={11} />
            </a>
          ) : (
            <span key={d.documentId} className="ev-file ev-file-flat">
              {d.fileName ?? 'Unnamed file'}
            </span>
          ),
        )}
      </span>

      <span className="ev-test">
        {traceable
          ? 'Traceable to source.'
          : 'Attached, but the reliability test is not yet satisfied.'}
        {agsaCriteria.length > 0 ? ' Satisfies ' + agsaCriteria.map(criterionLabel).join(', ') + '.' : null}
      </span>

      {onAttach ? (
        <button type="button" className="link" onClick={onAttach}>
          add
        </button>
      ) : null}
    </span>
  );
}
