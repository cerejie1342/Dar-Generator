import type { Settings } from '../types';

const KEY = 'dar-generator-settings-v1';

export const DEFAULT_SETTINGS: Settings = {
  pbeName: '',
  positionTitle: '',
  department: 'Information and Communications Technology Department',
  unit: '',
  supervisor: '',

  orgName: 'DAVAO CITY WATER DISTRICT',
  orgAddress: 'Km. 2.5 Mac Arthur Highway, Matina, Davao City',
  reportTitle: 'Project-Based Employee Daily Accomplishment Report',

  coreDuty: 'Development of ERP- Customer Services Management System-BCA.',
  coreMfo: 'Customer Services Management System\n- Billing\n- Collection',

  supportFunctions: [
    {
      id: 'good-governance',
      name: 'Good Governance',
      mfos: [
        'Compliance to COA Findings (AOMs) and Liquidation of Cash Advances',
        'Submission of duly signed and approved PAR/ICS',
      ],
    },
    {
      id: 'meetings',
      name: 'Attend Forums, Supervisor and Staff meetings and facilitate committee activities',
      mfos: ['All meetings are attended and facilitated committee activities on scheduled time'],
    },
    {
      id: 'reports',
      name: 'Submits reports',
      mfos: ['Quarterly and other reports assigned'],
    },
  ],
  supportStartNumber: 5,

  preparedBy: { name: '', title: '' },
  confirmedBy: { name: '', title: '' },
  notedBy: { name: '', title: '' },

  githubToken: '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  geminiApiKey: '',

  defaultSelections: [],
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      preparedBy: { ...DEFAULT_SETTINGS.preparedBy, ...parsed.preparedBy },
      confirmedBy: { ...DEFAULT_SETTINGS.confirmedBy, ...parsed.confirmedBy },
      notedBy: { ...DEFAULT_SETTINGS.notedBy, ...parsed.notedBy },
      supportFunctions: parsed.supportFunctions?.length
        ? parsed.supportFunctions
        : DEFAULT_SETTINGS.supportFunctions,
      // An env-provided Client ID wins unless the user typed their own.
      googleClientId: parsed.googleClientId || DEFAULT_SETTINGS.googleClientId,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function resetSettings(): void {
  localStorage.removeItem(KEY);
}
