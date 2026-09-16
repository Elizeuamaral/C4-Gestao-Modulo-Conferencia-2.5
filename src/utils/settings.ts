/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings } from '../types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  companyName: 'C4 Gestão',
  defaultAddress: 'ESTOQUE',
  locations: [
    'ESTOQUE',
    'SETOR-A-01',
    'SETOR-A-02',
    'SETOR-A-03',
    'SETOR-B-01',
    'SETOR-B-02',
    'SETOR-B-03',
    'SETOR-C-01',
    'SETOR-C-02',
    'SETOR-C-03',
    'SETOR-D-01',
    'SETOR-D-02',
    'GELADEIRA',
    'CAMARA',
    'PRATELEIRA',
  ],
  checkers: [
    'Conferente Geral',
    'Carlos Silva',
    'Mariana Souza',
  ],
  soundBeepEnabled: true,
  soundAlertEnabled: true,
  criticalExpiryDays: 30,
  warningExpiryDays: 90,
  safeExpiryDays: 90,
  adminPassword: '@Maral22',
};

export function loadStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('fast_stock_settings');
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      companyName: parsed.companyName || DEFAULT_APP_SETTINGS.companyName,
      defaultAddress: parsed.defaultAddress || DEFAULT_APP_SETTINGS.defaultAddress,
      locations: Array.isArray(parsed.locations) && parsed.locations.length > 0
        ? parsed.locations
        : DEFAULT_APP_SETTINGS.locations,
      checkers: Array.isArray(parsed.checkers)
        ? parsed.checkers
        : DEFAULT_APP_SETTINGS.checkers,
      soundBeepEnabled: parsed.soundBeepEnabled !== false,
      soundAlertEnabled: parsed.soundAlertEnabled !== false,
      criticalExpiryDays: Number(parsed.criticalExpiryDays) > 0
        ? Number(parsed.criticalExpiryDays)
        : DEFAULT_APP_SETTINGS.criticalExpiryDays,
      warningExpiryDays: Number(parsed.warningExpiryDays) > 0
        ? Number(parsed.warningExpiryDays)
        : DEFAULT_APP_SETTINGS.warningExpiryDays ?? 90,
      safeExpiryDays: Number(parsed.safeExpiryDays) > 0
        ? Number(parsed.safeExpiryDays)
        : (Number(parsed.warningExpiryDays) || 90),
      adminPassword: parsed.adminPassword || DEFAULT_APP_SETTINGS.adminPassword,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}
