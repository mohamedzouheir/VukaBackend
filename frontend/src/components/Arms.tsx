/*
 * The national coat of arms.
 *
 * The three departmental lockups, on the sidebar and on the two front door headers, used a drawn
 * shield that stood in for this. A placeholder beside the words "REPUBLIC OF SOUTH AFRICA" is the
 * kind of thing that is fine in a wireframe and wrong in front of the Department, so it is gone.
 *
 * <h2>Why an img rather than an inline SVG</h2>
 *
 * The heraldic drawing is 183 kilobytes, and almost all of that is real path data rather than
 * editor leftovers: the secretary bird, the rising sun, the Khoisan figures and the protea are
 * genuinely that detailed. Inlining it would put those bytes into the JavaScript bundle on every
 * page load, right after section 11.6 got them out of it. As a static file the browser fetches it
 * once, caches it, and serves it gzipped at roughly a third of that.
 *
 * <h2>Why it is decorative</h2>
 *
 * Every place this appears sits immediately beside text that already reads "Department: Sport,
 * Arts and Culture, REPUBLIC OF SOUTH AFRICA". A screen reader announcing "coat of arms of South
 * Africa" before that line adds nothing and interrupts it, so the image is hidden from the
 * accessibility tree and the words carry the meaning. This is the one case where an empty alt is
 * the accessible choice rather than the lazy one.
 */
import './Arms.css';

/**
 * @param size the rendered height in pixels. The drawing is 315 by 404, so it is taller than it
 *   is wide and the width follows from the aspect ratio rather than being set square.
 */
export function Arms({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/img/coat-of-arms.svg"
      alt=""
      aria-hidden="true"
      className={'arms' + (className ? ' ' + className : '')}
      style={{ height: size }}
      /* Intrinsic ratio, so the row does not reflow when the file arrives. */
      width={Math.round((size * 315.16901) / 404.18469)}
      height={size}
      draggable={false}
    />
  );
}
