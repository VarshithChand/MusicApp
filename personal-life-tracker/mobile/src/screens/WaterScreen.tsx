import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { WaterRow } from '../analytics/types';
import { recentWater, waterGoalProgress } from '../analytics/wellness';
import { DateField, entryTime, useEntryDate } from '../components/DateField';
import { Button, Card, Heading, Input, Muted, Page, Progress, Row, Title } from '../components/ui';
import { useData } from '../data';
import { addDays } from '../lib/dates';
import { message } from '../lib/errors';
import { useColors } from '../theme';

export function WaterScreen() {
  const { repos, today, version, changed } = useData();
  const c = useColors();
  const [entryDate, setEntryDate] = useEntryDate(today);
  const [rows, setRows] = useState<WaterRow[]>([]);
  const [target, setTarget] = useState(3000);
  const [targetText, setTargetText] = useState('3000');
  const [custom, setCustom] = useState('');

  const load = useCallback(async () => {
    const weekAgo = addDays(today, -6);
    const [w, t] = await Promise.all([repos.waterBetween(entryDate < weekAgo ? entryDate : weekAgo, today), repos.waterTargetMl()]);
    setRows(w);
    setTarget(t);
    setTargetText(String(t));
  }, [repos, today, version, entryDate]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => Alert.alert('Could not load', message(e)));
    }, [load]),
  );

  const add = async (ml: number) => {
    try {
      await repos.addWater(ml, entryTime(entryDate, today));
      changed();
    } catch (e) {
      Alert.alert('Could not save', message(e));
    }
  };

  const saveTarget = async () => {
    const v = Number(targetText);
    try {
      await repos.setWaterTargetMl(Math.round(v));
      changed();
    } catch (e) {
      Alert.alert('Could not save', message(e));
    }
  };

  const remove = (r: WaterRow) =>
    Alert.alert('Delete this entry?', `${r.ml} ml on ${r.localDate}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => r.id !== undefined && repos.deleteWater(r.id).then(changed).catch((e) => Alert.alert('Could not delete', message(e))) },
    ]);

  const p = waterGoalProgress(rows, entryDate, target);
  const days = recentWater(rows, today, target, 7);
  const todays = rows.filter((r) => r.localDate === entryDate);

  return (
    <Page>
      <Title>Water</Title>

      <Card>
        <DateField value={entryDate} today={today} onChange={setEntryDate} />
        <Text style={{ color: c.text, fontSize: 30, fontWeight: '700' }}>
          {p.ml} <Text style={{ fontSize: 16, fontWeight: '400', color: c.muted }}>of {target} ml</Text>
        </Text>
        <Progress percent={p.percent} />
        <Muted>{p.met ? 'Target reached.' : `${Math.max(0, target - p.ml)} ml to go.`}</Muted>
        <Row>
          {[250, 500, 750, 1000].map((ml) => (
            <Button key={ml} title={ml === 1000 ? '+1 L' : `+${ml} ml`} kind="secondary" onPress={() => add(ml)} />
          ))}
        </Row>
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Other amount (ml)" value={custom} onChangeText={setCustom} keyboardType="number-pad" placeholder="e.g. 330" />
          </View>
          <Button
            title="Add"
            onPress={() => {
              const v = Number(custom);
              if (!Number.isInteger(v) || v <= 0) {
                Alert.alert('Check the amount', 'Enter whole millilitres, like 330.');
                return;
              }
              add(v).then(() => setCustom(''));
            }}
          />
        </Row>
      </Card>

      <Card>
        <Heading>Daily target</Heading>
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Millilitres per day" value={targetText} onChangeText={setTargetText} keyboardType="number-pad" />
          </View>
          <Button title="Save" kind="secondary" onPress={saveTarget} />
        </Row>
      </Card>

      <Card>
        <Heading>Last 7 days</Heading>
        {days.map((d) => (
          <View key={d.date} style={{ gap: 4, paddingVertical: 3 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.date}</Text>
              <Muted>{d.logged ? `${d.ml} ml${d.met ? ' · target met' : ''}` : 'nothing recorded'}</Muted>
            </Row>
            <Progress percent={d.logged ? (d.ml / target) * 100 : 0} />
          </View>
        ))}
        <Muted>A day with nothing recorded is shown as unknown, not as 0 ml.</Muted>
      </Card>

      <Card>
        <Heading>{entryDate === today ? "Today's entries" : `Entries for ${entryDate}`}</Heading>
        {todays.length === 0 && <Muted>No water recorded for this day.</Muted>}
        {todays.map((r) => (
          <Pressable key={r.id} onLongPress={() => remove(r)} style={{ paddingVertical: 4 }} accessibilityHint="Long press to delete">
            <Text style={{ color: c.text }}>{r.ml} ml</Text>
          </Pressable>
        ))}
        {todays.length > 0 && <Muted>Long press an entry to delete it.</Muted>}
      </Card>
    </Page>
  );
}
