import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_RECENT = 5;

const storageKey = (uid: string) => `andpatelec_recent_${uid}`;

/** Últimos ítems abiertos en este dispositivo, del más nuevo al más viejo. */
export async function loadRecentItems(uid: string): Promise<string[][]> {
  try {
    const json = await AsyncStorage.getItem(storageKey(uid));
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error loading recent items:', error);
    return [];
  }
}

export async function rememberRecentItem(uid: string, path: string[]) {
  const key = path.join('\u0000');
  const current = await loadRecentItems(uid);
  const next = [path, ...current.filter((item) => item.join('\u0000') !== key)].slice(0, MAX_RECENT);
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(next)).catch((error) =>
    console.error('Error saving recent items:', error)
  );
}
