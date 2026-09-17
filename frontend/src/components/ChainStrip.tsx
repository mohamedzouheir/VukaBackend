/*
 * ChainStrip. Component 6 of nine.
 *
 * Allocated, promised, reported, verified, each with its citation. Section 8 of the
 * frontend design calls this the whole product in one row, and it is the reason the
 * accountability chain is modelled as foreign keys rather than as a diagram on a slide.
 *
 * The order is not cosmetic. It is the order a person who does not work in government
 * would ask about it, which is also the order the chain runs in.
 *
 * Five states, and the one that matters is error: each box independently shows a dash and
 * its reason, never the whole strip replaced by a message. A department that can read
 * three of the four boxes should be shown three of the four boxes.
 */
import type { ChainView } from '../lib/types';
import { num, rands } from '../lib/format';
import { CitationLine } from './CitationLine';
import './components.css';

interface Props {
  chain: ChainView | null;
  loading?: boolean;
  error?: string | null;
}

export function ChainStrip({ chain, loading, error }: Props) {
  return (
    <div className="chain" role="group" aria-label="The accountability chain for this entity">
      <ChainBox
        label="Allocated"
        value={rands(chain?.allocated)}
        citation={chain?.allocatedCitation}
        loading={loading}
        error={error}
        emptyReason="No allocation row for the current financial year."
      />
      <ChainBox
        label="Promised"
        value={
          chain?.promisedTargetCount === null || chain?.promisedTargetCount === undefined
            ? null
            : num(chain.promisedTargetCount) +
              (chain.promisedTargetCount === 1 ? ' target' : ' targets')
        }
        citation={chain?.promisedCitation}
        loading={loading}
        error={error}
        emptyReason="No targets registered for the year. An administrator loads these from the tabled Annual Performance Plan."
      />
      <ChainBox
        label="Reported"
        value={
          chain?.reportedCount === null || chain?.reportedCount === undefined
            ? null
            : num(chain.reportedCount) + ' of ' + num(chain.reportedOfCount)
        }
        citation={chain?.reportedCitation}
        loading={loading}
        error={error}
        emptyReason="Nothing reported for this period yet."
      />
      <ChainBox
        label="Verified"
        value={
          chain?.verifiedCount === null || chain?.verifiedCount === undefined
            ? null
            : num(chain.verifiedCount) + ' of ' + num(chain.verifiedOfCount)
        }
        citation={chain?.verifiedCitation}
        loading={loading}
        error={error}
        emptyReason="No evidence attached to any reported figure."
      />
    </div>
  );
}

function ChainBox({
  label,
  value,
  citation,
  loading,
  error,
  emptyReason,
}: {
  label: string;
  value: string | null;
  citation?: string | null;
  loading?: boolean;
  error?: string | null;
  emptyReason: string;
}) {
  return (
    <div className="chain-box">
      <h4>{label}</h4>

      {loading ? (
        <span className="skeleton" style={{ width: '6rem', height: '1.4rem' }} aria-hidden="true" />
      ) : error ? (
        <>
          <p className="chain-value chain-dash">&mdash;</p>
          <p className="small muted">Could not read the document store.</p>
        </>
      ) : value === null ? (
        <>
          <p className="chain-value chain-dash">&mdash;</p>
          <p className="small muted">{emptyReason}</p>
        </>
      ) : (
        <>
          <p className="chain-value">{value}</p>
          {citation ? <CitationLine text={citation} /> : null}
        </>
      )}
    </div>
  );
}
