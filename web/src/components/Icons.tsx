import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: React.ReactNode, viewBox = '0 0 24 24') {
  return function Icon({ size = 20, className = '', ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`shrink-0 ${className}`}
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const Icon = {
  Inbox: make(<><path d="M3 12h5l2 3h4l2-3h5" /><path d="M5 5h14l2 7v7H3v-7z" /></>),
  Send: make(<><path d="M21 3 10 14" /><path d="M21 3l-7 18-4-8-8-4z" /></>),
  Compose: make(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  Credits: make(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>),
  Attn: make(<><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></>),
  Settings: make(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  Copy: make(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  Check: make(<path d="M20 6 9 17l-5-5" />),
  Close: make(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  Menu: make(<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>),
  ArrowRight: make(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
  ArrowLeft: make(<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>),
  ChevronDown: make(<path d="m6 9 6 6 6-6" />),
  Wallet: make(<><path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z" /><path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" /><path d="M18 13.5h.01" /></>),
  Shield: make(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>),
  Globe: make(<><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></>),
  Spark: make(<><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></>),
  Mail: make(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
  Key: make(<><circle cx="8" cy="15" r="4" /><path d="m10.9 12.1 9.1-9.1" /><path d="M15 8l2 2" /><path d="M18 5l2 2" /></>),
  Terminal: make(<><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></>),
  Users: make(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>),
  ChartBar: make(<><path d="M3 3v18h18" /><path d="M8 17V9" /><path d="M13 17V5" /><path d="M18 17v-7" /></>),
  Lock: make(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  ExternalLink: make(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" /></>),
  Warning: make(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>),
  Info: make(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>),
  Trash: make(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>),
  Reply: make(<><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>),
  Ban: make(<><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>),
  Refresh: make(<><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>),
  Plus: make(<><path d="M12 5v14" /><path d="M5 12h14" /></>),
  Dot: make(<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />),
  Logo: make(<><rect x="2" y="2" width="20" height="20" rx="5" fill="#0052FF" stroke="none" /><path d="M6.5 15.5v-7l5.5 4 5.5-4v7" stroke="#fff" strokeWidth={1.9} /></>),
  Github: make(<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />),
  X: make(<path d="M4 4l16 16M20 4 4 20" />),
};

export type IconName = keyof typeof Icon;
