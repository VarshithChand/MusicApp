import React from 'react';
import { Image, StyleSheet, Switch, Text, View } from 'react-native';
import { Colors, useColors, useStyles } from '../theme';
import { InstalledApp } from '../types';

interface Props {
  app: InstalledApp;
  locked: boolean;
  onToggle: (on: boolean) => void;
}

function AppRowBase({ app, locked, onToggle }: Props) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      {app.iconUri ? <Image source={{ uri: app.iconUri }} style={styles.icon} /> : <View style={styles.icon} />}
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {app.label}
        </Text>
        <Text style={styles.pkg} numberOfLines={1}>
          {app.packageName}
        </Text>
      </View>
      <Text style={[styles.state, { color: locked ? colors.ok : colors.muted }]}>{locked ? 'ON' : 'OFF'}</Text>
      <Switch
        value={locked}
        onValueChange={onToggle}
        accessibilityLabel={`Lock ${app.label}`}
        trackColor={{ false: colors.surface2, true: colors.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

export const AppRow = React.memo(AppRowBase);

const makeStyles = (colors: Colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surface2 },
  text: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pkg: { color: colors.muted, fontSize: 12 },
  state: { fontSize: 12, fontWeight: '700', width: 28, textAlign: 'right' },
});
