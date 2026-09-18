/*
 * Line icons.
 *
 * Stroke only, 1.5px, currentColor, 24x24 viewBox, inlined as components. Section 11 of
 * the frontend design rules out icon fonts and images on any surface a low bandwidth user
 * touches, and an icon font is also a second request that can fail on its own. Inlining
 * costs a few hundred bytes per icon and cannot arrive late or half drawn.
 *
 * An icon is never the only carrier of meaning. Every one of these sits beside a text
 * label or is marked aria-hidden, so a screen reader reads the words rather than a shape.
 */
import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & { size?: number; label?: string };

function Icon({ size = 18, label, children, ...rest }: Props) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconDownload = (p: Props) => (
  <Icon {...p}><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></Icon>
);

export const IconUpload = (p: Props) => (
  <Icon {...p}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></Icon>
);

export const IconPhone = (p: Props) => (
  <Icon {...p}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18.5h2" /></Icon>
);

/* Provenance: a cell inside a sheet. */
export const IconSheet = (p: Props) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M9 9v11" />
    <rect x="12.5" y="12" width="5.5" height="4.5" rx="0.5" />
  </Icon>
);

export const IconPaperclip = (p: Props) => (
  <Icon {...p}><path d="M20.4 12.6 12 21a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 19" /></Icon>
);

export const IconCheck = (p: Props) => (
  <Icon {...p}><path d="m4 12.5 5 5L20 6.5" /></Icon>
);

export const IconCheckCircle = (p: Props) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.5 2.5L16 9.5" /></Icon>
);

export const IconAlert = (p: Props) => (
  <Icon {...p}>
    <path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </Icon>
);

export const IconInfo = (p: Props) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Icon>
);

export const IconHelp = (p: Props) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3" /><path d="M12 17h.01" /></Icon>
);

export const IconChevronRight = (p: Props) => (
  <Icon {...p}><path d="m9 5 7 7-7 7" /></Icon>
);

export const IconArrowLeft = (p: Props) => (
  <Icon {...p}><path d="M20 12H4" /><path d="m10 6-6 6 6 6" /></Icon>
);

export const IconExternal = (p: Props) => (
  <Icon {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></Icon>
);

export const IconClock = (p: Props) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></Icon>
);

export const IconCalendar = (p: Props) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></Icon>
);

export const IconLandmark = (p: Props) => (
  <Icon {...p}><path d="M3 21h18" /><path d="M4 21V10" /><path d="M9 21V10" /><path d="M15 21V10" /><path d="M20 21V10" /><path d="M2.5 10h19L12 3.5Z" /></Icon>
);

export const IconGauge = (p: Props) => (
  <Icon {...p}><path d="M3.5 18a9 9 0 1 1 17 0" /><path d="m12 13.5 4-4" /><circle cx="12" cy="14.5" r="1.4" /></Icon>
);

export const IconChart = (p: Props) => (
  <Icon {...p}><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7.5" y="12" width="3" height="5" /><rect x="13" y="8" width="3" height="9" /></Icon>
);

export const IconScale = (p: Props) => (
  <Icon {...p}><path d="M12 4v16" /><path d="M7 20h10" /><path d="M5.5 7h13" /><path d="M5.5 7 3 13h5Z" /><path d="M18.5 7 16 13h5Z" /></Icon>
);

export const IconCitation = (p: Props) => (
  <Icon {...p}><path d="M6 3h9l4 4v14H6Z" /><path d="M15 3v4h4" /><path d="M9 12h7" /><path d="M9 16h5" /></Icon>
);

export const IconList = (p: Props) => (
  <Icon {...p}><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="m4 6 1 1 1.5-2" /><path d="m4 12 1 1 1.5-2" /><path d="m4 18 1 1 1.5-2" /></Icon>
);

export const IconSend = (p: Props) => (
  <Icon {...p}><path d="M21 3 10.5 13.5" /><path d="M21 3l-7 18-3.5-7.5L3 10Z" /></Icon>
);

export const IconReturn = (p: Props) => (
  <Icon {...p}><path d="m9 10-5 5 5 5" /><path d="M4 15h11a5 5 0 0 0 5-5V4" /></Icon>
);

export const IconShield = (p: Props) => (
  <Icon {...p}><path d="M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6Z" /><path d="m8.5 12 2.5 2.5L16 10" /></Icon>
);

export const IconEye = (p: Props) => (
  <Icon {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Icon>
);

export const IconEyeOff = (p: Props) => (
  <Icon {...p}><path d="M3 3l18 18" /><path d="M10.6 6A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.3" /><path d="M6.6 7.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.5-.65" /><path d="M9.9 10.2a3 3 0 0 0 4 4.2" /></Icon>
);

export const IconSignOut = (p: Props) => (
  <Icon {...p}><path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /><path d="M16 8l4 4-4 4" /><path d="M20 12H9" /></Icon>
);

export const IconX = (p: Props) => (
  <Icon {...p}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></Icon>
);

export const IconSpinner = (p: Props) => (
  <Icon {...p}><path d="M12 3a9 9 0 1 0 9 9" /></Icon>
);

export const IconFilter = (p: Props) => (
  <Icon {...p}><path d="M3 5h18" /><path d="M6 12h12" /><path d="M10 19h4" /></Icon>
);

export const IconComment = (p: Props) => (
  <Icon {...p}><path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3v4l4.5-4H20a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" /></Icon>
);

export const IconLock = (p: Props) => (
  <Icon {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></Icon>
);

export const IconUser = (p: Props) => (
  <Icon {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></Icon>
);

/* ------------------------------------------------------------------ */
/* Navigation and chrome, added for the rail in docs/Front End designs */
/* ------------------------------------------------------------------ */

export const IconHome = (p: Props) => (
  <Icon {...p}><path d="m3 10.5 9-7 9 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></Icon>
);

export const IconFolder = (p: Props) => (
  <Icon {...p}><path d="M3 7.5a2 2 0 0 1 2-2h3.7a2 2 0 0 1 1.5.7l1 1.3H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></Icon>
);

export const IconSettings = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" />
  </Icon>
);

/** Workspaces: a group, matching the rail icon in the designs. */
export const IconWorkspaces = (p: Props) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="2.8" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <circle cx="17.5" cy="9.5" r="2.2" /><path d="M15 18.6a4.6 4.6 0 0 1 5.9-2.4" />
  </Icon>
);

export const IconTasks = (p: Props) => (
  <Icon {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m8 12.3 2.6 2.6L16.5 9" /></Icon>
);

export const IconSearch = (p: Props) => (
  <Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Icon>
);

export const IconBell = (p: Props) => (
  <Icon {...p}><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" /><path d="M10.5 20a2 2 0 0 0 3 0" /></Icon>
);

export const IconChevronDown = (p: Props) => (
  <Icon {...p}><path d="m5 9 7 7 7-7" /></Icon>
);

export const IconMenu = (p: Props) => (
  <Icon {...p}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></Icon>
);

/** The national coat of arms is not redrawn here. A simple mark stands in beside the wordmark. */
export const IconArms = (p: Props) => (
  <Icon {...p}>
    <path d="M12 3 5 6v5.5c0 4 2.9 7.4 7 8.5 4.1-1.1 7-4.5 7-8.5V6Z" />
    <path d="M9.5 12.5 12 15l2.5-4" />
  </Icon>
);

export const IconTrend = (p: Props) => (
  <Icon {...p}><path d="m3.5 15.5 5-5 3.5 3.5 6-6.5" /><path d="M14 7.5h4.5V12" /></Icon>
);

export const IconPlus = (p: Props) => (
  <Icon {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>
);
