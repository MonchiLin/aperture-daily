import { persistentAtom } from '@nanostores/persistent';

interface Settings {
    autoCopy: boolean;
    defaultLevel: 1 | 2 | 3;
}

// Persistent store for user preferences
export const settingsStore = persistentAtom<Settings>(
    'aperture-daily-preferences',
    {
        autoCopy: false,
        defaultLevel: 1,
    },
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    }
);

// Helper to update specific setting
export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    settingsStore.set({
        ...settingsStore.get(),
        [key]: value
    });
}
