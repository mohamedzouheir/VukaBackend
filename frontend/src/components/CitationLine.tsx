/*
 * CitationLine. Component 9 of nine. Under any published figure.
 *
 * Document, table, date. Small, grey, always present. This is what separates the numbers
 * in this product from an unattributed number on a government website that nobody
 * believes, and it is the cheapest component in the set to build and the one most likely
 * to be quietly dropped under time pressure, which is why it is a component rather than a
 * span some screens remember to add.
 */
import { IconCitation } from '../icons';
import './components.css';

export function CitationLine({ text, href }: { text: string; href?: string | null }) {
  return (
    <p className="citation">
      <IconCitation size={13} />
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {text}
        </a>
      ) : (
        <span>{text}</span>
      )}
    </p>
  );
}
