/** Customer-facing identity. Persistence and QR protocol identifiers are intentionally separate. */
export const BRAND = {
  company: 'NovaRace',
  product: 'Flow',
  name: 'NovaRace Flow',
  slug: 'novarace-flow',
  descriptor: 'Event check-in and gate operations',
  colors: {
    indigo: '#282462',
    sky: '#3FA9F5',
    magenta: '#E6007D',
    amber: '#FBB03B',
    lime: '#C7CC00',
    charcoal: '#333333',
    grey: '#606060',
    paper: '#FCFCFC',
  },
} as const;
