import React from 'react';
import { StyleSheet, Text as RNText, TextProps } from 'react-native';
import { FONT_FAMILIES, TEXT_SCALE, useSettings } from '../store/settings';

/** Text that follows the font and text-size choice in Settings. Use it in place of Text from react-native. */
export function AppText({ style, ...props }: TextProps) {
  const font = useSettings((s) => s.font);
  const textSize = useSettings((s) => s.textSize);
  const flat = StyleSheet.flatten(style) ?? {};
  const family = FONT_FAMILIES[font];
  return (
    <RNText
      {...props}
      style={[family ? { fontFamily: family } : null, flat, { fontSize: (flat.fontSize ?? 14) * TEXT_SCALE[textSize] }]}
    />
  );
}
