/*
 * The chart kit. Inline SVG, no library.
 *
 * It exists for one screen and one reader. An executive asked for the analytics as pictures
 * rather than as prose, and the honest version of that request is not "add a chart library": it
 * is that the page should answer a question at a glance and keep the figures underneath for
 * anyone who wants to check them. So every chart here carries its own numbers as text, and every
 * chart can be flipped to the table it was drawn from. A picture that cannot be checked is a
 * claim, and this product is about claims that can be.
 *
 * <h2>Rules that are not decoration</h2>
 *
 * One measure per axis, and never two scales on one chart. Money and delivery sit side by side as
 * two charts rather than one with a second y axis, for the same reason the sector table never
 * divides rands by outcomes: a cost per outcome across a ballet company and a boxing regulator is
 * not a comparison this product makes.
 *
 * Absent is never zero. A year with no audited figure draws no bar and says "not audited"; it
 * does not draw a bar of height nought, which would read as a rate of nought per cent.
 *
 * Colour is never the only carrier. Every series is labelled in text, every segment of a stack is
 * named in the sentence beside it, and the not-applicable segment is hatched as well as grey.
 *
 * <h2>The palette</h2>
 *
 * Checked with the colour validator rather than by eye, against the light surface these screens
 * use. There is no dark theme on the office surface, so there is one palette to hold.
 *
 *   categorical, in fixed order: #1D6BF3 #0E9AA7 #7C5CFC #C2389E
 *     passes the lightness band, the chroma floor, colour-blind separation and contrast. Four is
 *     the whole set: a fifth series folds into "other" rather than becoming a generated hue.
 *
 *   status: good #15803D, warning #CA8A04, critical #DC2626
 *     passes separation. The warning step sits at 2.86:1 against white, just under the 3:1 line,
 *     which obliges visible labels rather than colour alone. Every status chart here prints its
 *     counts on the page and keeps its table, so that relief is already in place.
 *
 *   neutral #94A3B8, hatched: not applicable, not due, not published. Never a series.
 */
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import './Charts.css';

export const VIZ = {
  cat: ['#1D6BF3', '#0E9AA7', '#7C5CFC', '#C2389E'],
  good: '#15803D',
  warn: '#CA8A04',
  bad: '#DC2626',
  none: '#94A3B8',
} as const;

export interface Slice {
  key: string;
  label: string;
  value: number;
  colour: string;
  /** True where this slice is an absence rather than a quantity: hatched, never counted as a series. */
  hatched?: boolean;
}

export interface Datum {
  key: string;
  /** Under the bar. Kept to a few characters: this is an axis, not a sentence. */
  label: string;
  /** Null draws no bar at all and prints absentText instead. Absent is never zero. */
  value: number | null;
  /** What the bar says when it is hovered, and what the row says in the table. */
  detail: string;
  /** Printed above the bar. Only where it earns the space: never a number on every mark. */
  note?: string;
  absentText?: string;
  emphasis?: boolean;
}

/* ------------------------------------------------------------------ */
/* frame                                                               */
/* ------------------------------------------------------------------ */

/**
 * The box a chart sits in: a heading, the picture, and the same data as a table one click away.
 *
 * The table is the accessibility relief and the audit trail at once. It is not a fallback for a
 * chart that failed to render, it is the record the chart was drawn from, and an executive who
 * wants to quote a figure in a committee takes it from there.
 */
export function Figure({
  title, hint, children, table, wide,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  table?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const [showing, setShowing] = useState(false);
  return (
    <figure className={'viz' + (wide ? ' viz-wide' : '')}>
      <figcaption>
        <h3>{title}</h3>
        {hint ? <p className="small muted">{hint}</p> : null}
        {table ? (
          <button type="button" className="link viz-toggle" aria-expanded={showing} onClick={() => setShowing((v) => !v)}>
            {showing ? t('viz.hideFigures') : t('viz.showFigures')}
          </button>
        ) : null}
      </figcaption>
      <div className="viz-body">{children}</div>
      {table && showing ? <div className="viz-table table-wrap">{table}</div> : null}
    </figure>
  );
}

/** A legend. Present whenever there is more than one series, because colour alone never carries identity. */
export function Legend({ items }: { items: { label: string; colour: string; hatched?: boolean }[] }) {
  return (
    <ul className="viz-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span
            className={'viz-swatch' + (i.hatched ? ' viz-hatched' : '')}
            style={{ background: i.colour }}
            aria-hidden="true"
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* the hover layer                                                     */
/* ------------------------------------------------------------------ */

/**
 * One tooltip implementation for every chart here.
 *
 * Positioned against the chart box rather than the page, so it survives the card scrolling, and
 * it is aria-hidden: the same sentence is already on the mark as a title for assistive technology
 * and in the table underneath. A tooltip announced twice is worse than one not announced at all.
 */
function useHover() {
  const [at, setAt] = useState<{ x: number; y: number; text: string } | null>(null);
  const show = (e: { currentTarget: Element; clientX: number; clientY: number }, text: string) => {
    const box = e.currentTarget.closest('.viz-plot')?.getBoundingClientRect();
    if (!box) return;
    setAt({ x: e.clientX - box.left, y: e.clientY - box.top, text });
  };
  const tip = at ? (
    <span className="viz-tip" style={{ left: at.x, top: at.y }} aria-hidden="true">
      {at.text}
    </span>
  ) : null;
  return { show, hide: () => setAt(null), tip };
}

/* ------------------------------------------------------------------ */
/* columns: one measure across a handful of periods                    */
/* ------------------------------------------------------------------ */

/**
 * Vertical bars, one series, for a measure across years or quarters.
 *
 * One series, so there is no legend: the title names what is being measured. The scale starts at
 * zero and says so, because a truncated bar axis is the oldest way to make a two percent movement
 * look like a collapse.
 */
export function Columns({
  data, colour = VIZ.cat[0], height = 180, label,
}: {
  data: Datum[];
  colour?: string;
  height?: number;
  /** Read to a screen reader in place of the picture. The table underneath carries the detail. */
  label: string;
}) {
  const { t } = useI18n();
  const hover = useHover();
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  // Room above the tallest bar for the figure printed over it. The bars and the labels are two
  // separate rows rather than one: a label nudged below the axis line with a transform overflows
  // its container and lands on whatever the card puts next.
  const plot = height - 18;

  return (
    <div className="viz-plot" onMouseLeave={hover.hide}>
      <div className="viz-cols" style={{ height }} role="img" aria-label={label}>
        {data.map((d) => {
          const h = d.value === null ? 0 : Math.max(2, (d.value / max) * plot);
          return (
            <div key={d.key} className={'viz-col' + (d.emphasis ? ' viz-col-on' : '')}>
              <span className="viz-col-note">{d.note ?? ''}</span>
              {d.value === null ? (
                <span className="viz-absent" title={d.detail}>
                  {d.absentText ?? t('viz.notAvailable')}
                </span>
              ) : (
                <span
                  className="viz-bar"
                  style={{ height: h, background: colour }}
                  title={d.detail}
                  onMouseMove={(e) => hover.show(e, d.detail)}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="viz-axis" aria-hidden="true">
        {data.map((d) => (
          <span key={d.key} className={'viz-col-label' + (d.emphasis ? ' viz-col-on' : '')}>
            {d.label}
          </span>
        ))}
      </div>
      {hover.tip}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* horizontal bars: one measure across named things                    */
/* ------------------------------------------------------------------ */

/**
 * Horizontal bars, one series, for a measure across things whose names need room: sectors,
 * entities. Identity is carried by the label on the axis, so one hue is correct here and a
 * different colour per row would be decoration claiming to be information.
 */
export function Bars({ data, colour = VIZ.cat[0], label }: { data: Datum[]; colour?: string; label: string }) {
  const { t } = useI18n();
  const hover = useHover();
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  return (
    <div className="viz-plot" onMouseLeave={hover.hide}>
      <ul className="viz-bars" role="img" aria-label={label}>
        {data.map((d) => (
          <li key={d.key}>
            <span className="viz-row-label" title={d.label}>{d.label}</span>
            {/* An absent value draws an empty track and says so in the value column, rather than
                putting a sentence inside a 14px bar and bursting it. */}
            <span className="viz-track">
              {d.value === null ? null : (
                <span
                  className="viz-bar-h"
                  style={{ width: Math.max(2, (d.value / max) * 100) + '%', background: colour }}
                  title={d.detail}
                  onMouseMove={(e) => hover.show(e, d.detail)}
                />
              )}
            </span>
            <span className={'viz-row-value' + (d.value === null ? ' viz-absent' : '')}>
              {d.value === null ? d.absentText ?? t('viz.notReported') : d.note ?? ''}
            </span>
          </li>
        ))}
      </ul>
      {hover.tip}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* stacks: parts of a whole, in a fixed order                          */
/* ------------------------------------------------------------------ */

/**
 * One horizontal stacked bar. Segments carry a 2px gap of surface between them, so two adjacent
 * segments of similar colour never read as one, and the absent segment is hatched.
 */
export function Stack({ slices, label }: { slices: Slice[]; label: string }) {
  const hover = useHover();
  const id = useId().replace(/:/g, '');
  const total = slices.reduce((n, s) => n + s.value, 0);
  const present = slices.filter((s) => s.value > 0);
  if (total === 0) return <p className="small muted viz-empty">{label}</p>;

  return (
    <div className="viz-plot" onMouseLeave={hover.hide}>
      <span className="viz-stack" role="img" aria-label={label}>
        {present.map((s) => (
          <span
            key={s.key}
            className={'viz-seg' + (s.hatched ? ' viz-hatched' : '')}
            style={{ width: (s.value / total) * 100 + '%', background: s.colour }}
            title={s.label + ': ' + s.value}
            id={id + s.key}
            onMouseMove={(e) => hover.show(e, s.label + ': ' + s.value)}
          />
        ))}
      </span>
      {hover.tip}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* movement: two points and the line between them                      */
/* ------------------------------------------------------------------ */

/**
 * A dumbbell per entity: where it was, where it is, and the direction between.
 *
 * The form is chosen for what it refuses to do. Two bars per entity invite the eye to compare the
 * heights of entities that have nothing to do with each other; a dumbbell puts the comparison
 * inside the row, where the only honest comparison is. Direction is carried by an arrow and by
 * the signed number, not only by the colour of the connector.
 */
export function Dumbbells({
  rows, fromLabel, toLabel,
}: {
  rows: { key: string; label: string; from: number; to: number; detail: string; href?: string }[];
  fromLabel: string;
  toLabel: string;
}) {
  const hover = useHover();
  return (
    <div className="viz-plot" onMouseLeave={hover.hide}>
      <Legend
        items={[
          { label: fromLabel, colour: VIZ.cat[2] },
          { label: toLabel, colour: VIZ.cat[0] },
        ]}
      />
      <ul className="viz-dumbbells">
        {rows.map((r) => {
          const up = r.to >= r.from;
          const lo = Math.min(r.from, r.to);
          const hi = Math.max(r.from, r.to);
          return (
            <li key={r.key} onMouseMove={(e) => hover.show(e, r.detail)}>
              <span className="viz-row-label" title={r.label}>{r.label}</span>
              <span className="viz-track" title={r.detail}>
                <span
                  className={'viz-link ' + (up ? 'viz-up' : 'viz-down')}
                  style={{ left: lo + '%', width: Math.max(0.5, hi - lo) + '%' }}
                />
                <span className="viz-dot" style={{ left: r.from + '%', background: VIZ.cat[2] }} />
                <span className="viz-dot viz-dot-to" style={{ left: r.to + '%', background: VIZ.cat[0] }} />
              </span>
              <span className={'viz-row-value ' + (up ? 'viz-up-text' : 'viz-down-text')}>
                <span aria-hidden="true">{up ? '↑' : '↓'}</span>{' '}
                {(r.to - r.from > 0 ? '+' : '') + (Math.round((r.to - r.from) * 10) / 10).toFixed(1)} pts
              </span>
            </li>
          );
        })}
      </ul>
      {hover.tip}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ring: parts of a whole, when the whole is the headline              */
/* ------------------------------------------------------------------ */

/**
 * A ring, for the one place a part of a whole is the headline: the executive's portfolio, where
 * the question is how much of it is in good standing. The figure in the middle says that in words,
 * and the legend beside it carries every segment's count and share, so the ring is a picture of
 * numbers already printed rather than the only place they appear.
 *
 * Segments are separated by a gap of surface, as in the stacked bar, so two neighbours of similar
 * colour never read as one.
 */
export function Ring({
  slices, label, centre, centreSub, size = 150,
}: {
  slices: Slice[];
  label: string;
  centre: string;
  centreSub: string;
  size?: number;
}) {
  const hover = useHover();
  const total = slices.reduce((n, s) => n + s.value, 0);
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const present = slices.filter((s) => s.value > 0);
  // A gap only exists between two segments. One segment is a whole ring.
  const gap = present.length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <div className="viz-plot viz-ring" onMouseLeave={hover.hide} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunk)" strokeWidth={stroke} />
        {total > 0
          ? present.map((s) => {
              const len = (s.value / total) * c;
              const dash = Math.max(0.5, len - gap);
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  onMouseMove={(e) => hover.show(e, s.label + ': ' + s.value)}
                >
                  <title>{s.label + ': ' + s.value}</title>
                </circle>
              );
              offset += len;
              return el;
            })
          : null}
      </svg>
      <span className="viz-ring-centre" aria-hidden="true">
        <strong>{centre}</strong>
        <em>{centreSub}</em>
      </span>
      {hover.tip}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* line: one rate across periods                                       */
/* ------------------------------------------------------------------ */

/**
 * One rate across a handful of periods, on a fixed nought to a hundred scale.
 *
 * A period with no value draws no point and the line breaks there rather than bridging it: a line
 * drawn across a year nobody audited would claim a trend through data that does not exist. The
 * gap carries its own words on the axis instead.
 */
export function Line({
  data, colour = VIZ.cat[0], height = 170, label,
}: {
  data: Datum[];
  colour?: string;
  height?: number;
  label: string;
}) {
  const { t } = useI18n();
  const hover = useHover();
  const w = 320;
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 8;
  const plotH = height - padT - padB;
  const step = data.length > 1 ? (w - padL - padR) / (data.length - 1) : 0;
  const x = (i: number) => (data.length > 1 ? padL + i * step : (w + padL - padR) / 2);
  const y = (v: number) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;

  // Runs of consecutive present values, each drawn as its own line so an absent period breaks it.
  const runs: { i: number; v: number }[][] = [];
  data.forEach((d, i) => {
    if (d.value === null) return;
    const last = runs.at(-1);
    if (last && last.at(-1)!.i === i - 1) last.push({ i, v: d.value });
    else runs.push([{ i, v: d.value }]);
  });

  return (
    <div className="viz-plot" onMouseLeave={hover.hide}>
      <svg
        className="viz-line"
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        style={{ height }}
      >
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} className="viz-grid" />
            <text x={padL - 6} y={y(g) + 3.5} className="viz-tick" textAnchor="end">{g}%</text>
          </g>
        ))}
        {runs.map((run, k) => (
          <polyline
            key={k}
            fill="none"
            stroke={colour}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            points={run.map((p) => x(p.i) + ',' + y(p.v)).join(' ')}
          />
        ))}
      </svg>
      {/* Points and their figures are HTML over the SVG, so they stay round and legible when the
          plot stretches to the width of its card. */}
      <div className="viz-line-marks" style={{ height }}>
        {data.map((d, i) =>
          d.value === null ? null : (
            <span
              key={d.key}
              className="viz-line-point"
              style={{ left: (x(i) / w) * 100 + '%', top: y(d.value), borderColor: colour }}
              title={d.detail}
              onMouseMove={(e) => hover.show(e, d.detail)}
            >
              {d.note ? <span className="viz-line-note">{d.note}</span> : null}
            </span>
          ),
        )}
      </div>
      <div className="viz-line-axis" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.key} style={{ left: (x(i) / w) * 100 + '%' }} className={d.emphasis ? 'viz-col-on' : undefined}>
            {d.label}
            {d.value === null ? <em>{d.absentText ?? t('viz.notAvailable')}</em> : null}
          </span>
        ))}
      </div>
      {hover.tip}
    </div>
  );
}
