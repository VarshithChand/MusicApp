import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { AppText as Text } from './AppText';
import { colors, themedStyles } from '../theme/theme';
import { Icon } from './Icon';

export interface DropdownOption {
  key: string | null;
  label: string;
}

interface Props {
  label: string;
  value: string | null;
  options: DropdownOption[];
  onChange: (key: string | null) => void;
}

/** A compact picker for one choice out of a short list, so Home can offer more than a row of chips fits. */
export function Dropdown({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value) ?? options[0];

  return (
    <>
      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label}`}
      >
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue} numberOfLines={1}>
          {selected?.label}
        </Text>
        <Icon name="chevronDown" size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={`Close ${label}`}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView>
              {options.map((o) => {
                const on = o.key === value;
                return (
                  <Pressable
                    key={o.key ?? 'all'}
                    style={styles.option}
                    onPress={() => {
                      onChange(o.key);
                      setOpen(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
                    {on && <Icon name="check" size={18} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = themedStyles(() => ({
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldLabel: { color: colors.muted, fontSize: 12 },
  fieldValue: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  sheetTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50 },
  optionText: { color: colors.text, fontSize: 15 },
  optionTextOn: { color: colors.accent, fontWeight: '700' },
}));
