/*
 * One search field, used by every search on every screen.
 *
 * There were three of these and they were each positioned by hand, so they each drifted
 * differently. The fault in all of them was the same: an absolutely positioned bare <svg> inside
 * a relative wrapper. An svg is an inline element, so it carries the line box and the font's
 * descender with it, and centring it against the wrapper rather than against the input leaves it
 * riding a pixel or two high next to the placeholder. It looks like nothing and reads as sloppy.
 *
 * The fix is structural rather than a nudge: the icon is a flex box pinned to the input's own
 * top and bottom, so it is centred on the control it belongs to and cannot drift when the font,
 * the field height or the zoom level changes. The left inset and the input's left padding come
 * from the same variable, so the gap between icon and text is stated once.
 */
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { IconSearch } from '../icons';
import './SearchField.css';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /** Always required. A magnifying glass is decoration, not a label. */
  label: string;
  name?: string;
  /** The pill shape the top bar uses. Screens inside the page use the default. */
  pill?: boolean;
  className?: string;
  children?: ReactNode;
}

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  label,
  name = 'q',
  pill,
  className,
}: Props) {
  const content = (
    <>
      <span className="search-icon" aria-hidden="true">
        <IconSearch size={18} />
      </span>
      <input
        name={name}
        type="search"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={onChange ? (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value) : undefined}
      />
    </>
  );

  const classes =
    'search-field' + (pill ? ' search-pill' : '') + (className ? ' ' + className : '');

  if (!onSubmit) return <div className={classes}>{content}</div>;

  return (
    <form
      className={classes}
      role="search"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const entered = new FormData(e.currentTarget).get(name);
        onSubmit(String(entered ?? ''));
      }}
    >
      {content}
    </form>
  );
}
