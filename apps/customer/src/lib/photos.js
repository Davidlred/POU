import React from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Sheet, Txt, Button } from '@p360/shared';

// Take a photo or choose from the gallery. Returns the picked assets, or null if cancelled.
// max > 1 lets the gallery pick several at once (the camera always takes one).
export async function getPhotos(camera, max = 1) {
  if (camera) {
    // Android refuses to open the camera unless the permission was requested first.
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      Alert.alert('Camera is off', 'Allow camera access for Poultry360 in your phone settings.',
        [{ text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() }]);
      return null;
    }
  }
  const opts = { quality: 0.6, mediaTypes: ['images'], ...(!camera && max > 1 ? { allowsMultipleSelection: true, selectionLimit: max } : {}) };
  try {
    const r = await (camera ? ImagePicker.launchCameraAsync(opts) : ImagePicker.launchImageLibraryAsync(opts));
    return r.canceled ? null : r.assets;
  } catch (e) {
    Alert.alert(camera ? "Couldn't open the camera" : "Couldn't open your photos", 'Please try again.');
    return null;
  }
}

// Phones ask camera or gallery; the website goes straight to the browser's picker (which offers the camera on phones).
export const asksSource = Platform.OS !== 'web';

// The camera-or-gallery choice behind a "+" photo tile.
export function PhotoSourceSheet({ visible, onClose, onPick }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt v="h1">Add a photo</Txt>
      <Button icon="camera-outline" title="Take photo" onPress={() => { onClose(); onPick(true); }} />
      <Button variant="outline" icon="image-outline" title="Choose from gallery" onPress={() => { onClose(); onPick(false); }} />
    </Sheet>
  );
}
