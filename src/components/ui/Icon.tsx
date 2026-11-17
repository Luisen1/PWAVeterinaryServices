import type { SVGProps } from 'react';

const paths = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  compass: 'm16 8-3 5-5 3 3-5 5-3ZM22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  calendar:
    'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 11h2m4 0h2',
  user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  box: 'm3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10',
  alert:
    'M12 9v4m0 4h.01M10 4 2 18a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3L14 4a2 2 0 0 0-4 0Z',
  refresh:
    'M3 11a9 9 0 0 1 15-6l3 3M21 3v5h-5M21 13a9 9 0 0 1-15 6l-3-3M3 21v-5h5',
  check: 'm5 12 4 4L19 6',
  back: 'M19 12H5m6 6-6-6 6-6',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  paw: 'M9 15c1.5-2.5 4.5-2.5 6 0l2.4 3.4c1.4 2.3-.8 3.6-2.7 2.7a6.5 6.5 0 0 0-5.4 0c-1.9.9-4.1-.4-2.7-2.7L9 15ZM7 10a2 3 0 1 1-4 0 2 3 0 0 1 4 0Zm5-5a2 3 0 1 1-4 0 2 3 0 0 1 4 0Zm5 0a2 3 0 1 1-4 0 2 3 0 0 1 4 0Zm4 5a2 3 0 1 1-4 0 2 3 0 0 1 4 0Z',
  store:
    'M3 10V4h18v6M2 10h20l-2-6H4l-2 6Zm1 0v2a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2v-2M4 15v6h16v-6M9 21v-6h6v6',
  mail: 'M3 5h18v14H3V5Zm0 1 9 7 9-7',
  chat: 'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5ZM8 10h8M8 14h5',
  lock: 'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 4v3',
  key: 'M14 8a5 5 0 1 1-9-3 5 5 0 0 1 9 3Zm0 2 7 7v4h-4v-3h-3l-3-3M7 7h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  eyeOff:
    'm3 3 18 18M10.6 5.1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.8M6.3 6.3A22 22 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5.7-1.7M10 10a3 3 0 0 0 4 4',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  phone: 'm7 3 3 5-3 3a15 15 0 0 0 6 6l3-3 5 3-1 4c-10 2-19-7-17-17l4-1Z',
  clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  shield: 'm12 2 8 3v6c0 6-8 11-8 11S4 17 4 11V5l8-3Zm-4 9 3 3 5-6',
  edit: 'm16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm9 5 7 7-7 7',
  logout: 'M9 3H4v18h5m5-16 7 7-7 7M8 12h13',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  photo: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M15 7h.01',
  camera:
    'M8 5 10 3h4l2 2h4a1 1 0 0 1 1 1v13H3V6a1 1 0 0 1 1-1h4Zm8 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  microphone:
    'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-4 6v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8',
  send: 'm3 3 19 9-19 9 4-9-4-9Zm4 9h15',
  stop: 'M7 7h10v10H7V7Z',
  close: 'm6 6 12 12M6 18 18 6',
  settings: 'M3 7h18M3 17h18M8 4v6m8 4v6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
} satisfies Record<string, string>;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
