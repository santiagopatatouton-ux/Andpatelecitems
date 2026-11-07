import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

export interface PickedSheet {
  data: string | ArrayBuffer;
  isBase64: boolean;
}

/** Abre el selector de archivos y devuelve una planilla lista para leer con XLSX. */
export async function pickSpreadsheet(): Promise<PickedSheet | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const { uri } = result.assets[0];
  if (Platform.OS === 'web') {
    return { data: await (await fetch(uri)).arrayBuffer(), isBase64: false };
  }
  const FileSystem = await import('expo-file-system/legacy');
  const data = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { data, isBase64: true };
}
