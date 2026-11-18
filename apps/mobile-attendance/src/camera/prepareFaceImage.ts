import ImageResizer from 'react-native-image-resizer';
import RNFS from 'react-native-fs';

export async function prepareFaceImage(path: string): Promise<string> {
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  const resized = await ImageResizer.createResizedImage(
    uri,
    640,
    640,
    'JPEG',
    65,
    0,
    undefined,
    false,
    { mode: 'contain' },
  );
  const localPath = resized.uri.replace(/^file:\/\//, '');
  return RNFS.readFile(localPath, 'base64');
}
