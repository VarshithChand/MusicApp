import React, { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, Heading, Input, Muted, Page, Row, Title } from '../components/ui';
import { useData } from '../data';
import { monthOf } from '../lib/dates';
import { message } from '../lib/errors';
import { formatInr, parseAmountToMinor } from '../lib/money';
import { useColors } from '../theme';

export function MoreScreen() {
  const { repos, today, version, changed } = useData();
  const c = useColors();
  const month = monthOf(today);
  const [budget, setBudget] = useState<number | null>(null);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    setBudget(await repos.getBudget(month));
  }, [repos, month, version]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => Alert.alert('Could not load', message(e)));
    }, [load]),
  );

  const save = async () => {
    const minor = parseAmountToMinor(text);
    if (minor === null) {
      Alert.alert('Check the amount', 'Enter a budget like 20000.');
      return;
    }
    try {
      await repos.setBudget(month, minor);
      setText('');
      changed();
    } catch (e) {
      Alert.alert('Could not save', message(e));
    }
  };

  return (
    <Page>
      <Title>More</Title>

      <Card>
        <Heading>Budget for {month}</Heading>
        <Text style={{ color: c.text, fontSize: 18 }}>{budget === null ? 'No budget set' : formatInr(budget)}</Text>
        <Row>
          <Input label="Monthly budget (rupees)" value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder="e.g. 20000" style={{ minWidth: 160 }} />
          <Button title="Save" onPress={save} />
        </Row>
      </Card>

      <Card>
        <Heading>About your data</Heading>
        <Muted>This app works completely offline. It has no internet permission, no account and no server. Everything you enter stays on this phone, and the calculations and insights are made on the phone.</Muted>
        <Muted>Because the phone is the only copy, uninstalling the app or resetting the phone deletes your data. Backup and restore is planned but not built yet.</Muted>
      </Card>

      <Card>
        <Heading>Status</Heading>
        <Muted>Built: spending, food, water, budget, daily check ("I recorded everything"), insights from your entries.</Muted>
        <Muted>Not built yet: watch and Health Connect data (steps, sleep, heart rate), screen time, loans and payments, reminders, backup and export.</Muted>
      </Card>
    </Page>
  );
}
