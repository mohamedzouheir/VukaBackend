/*
 * ProvenanceCell. Component 4 of nine. Wherever a figure appears.
 *
 * The first of the three rules everything else follows from: a number never appears
 * without its provenance. Not in a tooltip, not behind a click, in the same visual unit
 * as the number. This component is that rule made into code, and it is the reason a
 * figure cannot be rendered anywhere in the product without its source coming with it.
 *
 * Five states. Empty is "Entered by hand, no source cell", which is a real and acceptable
 * state rather than a failure. Loading puts the value first and the cell reference second,
 * because the value is what the reader is waiting for. Denied shows the value and
 * disables the link with a reason, since the figure itself is not the secret.
 */
import { IconExternal, IconSheet } from '../icons';
import { splitSourceCell } from '../lib/format';
import { openFile } from '../lib/api';
import { useI18n } from '../lib/i18n';
import './components.css';

interface Props {
  /** Already formatted. Null renders as an absence, never as a zero. */
  value: string | null;
  /** "Quarterly Report!H14" shape. Null means the figure was entered by hand. */
  sourceLocation: string | null;
  /** Opens the original uploaded file at that cell. Absent disables the link. */
  documentUrl?: string | null;
  /** The reason the link is disabled, shown rather than left as a dead control. */
  linkDisabledReason?: string | null;
  /** What to say when there is no figure. "No result reported" by default. */
  emptyText?: string;
  size?: 'sm' | 'md';
}

export function ProvenanceCell({
  value,
  sourceLocation,
  documentUrl,
  linkDisabledReason,
  emptyText,
  size = 'md',
}: Props) {
  const { t } = useI18n();
  const source = splitSourceCell(sourceLocation);
  /* Defaulted here rather than in the signature, because the default is now a lookup and a
     default parameter would be evaluated before the hook has a language to look it up in. */
  const empty = emptyText ?? t('common.noResultReported');

  return (
    <span className={'prov prov-' + size}>
      {value === null ? (
        <span className="prov-empty">{empty}</span>
      ) : (
        <span className="prov-value">{value}</span>
      )}

      {source ? (
        documentUrl ? (
          <a
            className="prov-source"
            href={documentUrl}
            onClick={(e) => openFile(e, documentUrl, 'source.xlsx')}
            title={t('prov.download', source.sheet ?? t('prov.theSheet'), source.cell)}
          >
            <IconSheet size={14} />
            <span>
              from {source.sheet ? source.sheet + '!' : null}
              <span className="mono">{source.cell}</span>
            </span>
            <IconExternal size={12} />
          </a>
        ) : (
          <span className="prov-source prov-source-flat" title={linkDisabledReason ?? undefined}>
            <IconSheet size={14} />
            <span>
              from {source.sheet ? source.sheet + '!' : null}
              <span className="mono">{source.cell}</span>
            </span>
            {linkDisabledReason ? <span className="prov-why">{linkDisabledReason}</span> : null}
          </span>
        )
      ) : value === null ? null : (
        <span className="prov-source prov-source-flat prov-byhand">
          <IconSheet size={14} />
          <span>{t('prov.byHand')}</span>
        </span>
      )}
    </span>
  );
}

/** Loading. Value first, cell reference second, exactly as section 10 specifies. */
export function ProvenanceCellSkeleton() {
  return (
    <span className="prov prov-md" aria-hidden="true">
      <span className="skeleton" style={{ width: '3.5rem', height: '1.1rem' }} />
      <span className="skeleton" style={{ width: '9rem', height: '0.8rem' }} />
    </span>
  );
}
