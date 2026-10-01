import React from 'react';
import { Image, View } from 'react-native';
import { mediaUrl } from '../api/http';
import { coverPalette } from '../theme/theme';

interface Props {
  id: number;
  uri?: string | null;
  size: number;
  /** Corner radius; defaults to a rounded square, pass size / 2 for a circle. */
  radius?: number;
}

/** Artwork if there is any, otherwise a stable placeholder in the app's cover palette. */
export function Cover({ id, uri, size, radius = Math.round(size * 0.2) }: Props) {
  const [base, highlight] = coverPalette[Math.abs(id) % coverPalette.length];
  const src = mediaUrl(uri);
  if (src) return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: radius }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: base, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.66,
          height: size * 0.66,
          borderRadius: size * 0.33,
          backgroundColor: highlight,
          right: -size * 0.16,
          bottom: -size * 0.16,
        }}
      />
    </View>
  );
}
