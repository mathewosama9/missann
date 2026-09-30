import { Grade } from '@miss-ann/shared';
import { FlaskArt, MicroscopeArt, AtomIcon } from '../../components/ScienceArt';

// هوية بصرية لكل صف: رقم الخانة + لون + رسمة
export const GRADE_META = {
  [Grade.FOURTH_PRIMARY]: {
    num: '٤',
    code: '04',
    Art: FlaskArt,
    tile: 'bg-lime-300 text-ink-900',
    soft: 'bg-lime-100',
    ring: 'text-lime-700',
  },
  [Grade.FIFTH_PRIMARY]: {
    num: '٥',
    code: '05',
    Art: MicroscopeArt,
    tile: 'bg-coral-400 text-ink-900',
    soft: 'bg-coral-100',
    ring: 'text-coral-700',
  },
  [Grade.SIXTH_PRIMARY]: {
    num: '٦',
    code: '06',
    Art: AtomIcon,
    tile: 'bg-brand-500 text-white',
    soft: 'bg-brand-100',
    ring: 'text-brand-700',
  },
} as const;
