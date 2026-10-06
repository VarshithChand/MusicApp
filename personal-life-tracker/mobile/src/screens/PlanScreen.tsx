import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LoanRow, loanStatus, monthPlan, nextSalaryDate, SalaryRow } from '../analytics/plan';
import { buildReminders, ReminderItem } from '../analytics/reminders';
import { categoryBreakdown, monthSummary } from '../analytics/spending';
import { Badge, Button, Card, Chip, Heading, Input, Muted, Page, Progress, Row, Title } from '../components/ui';
import { useData } from '../data';
import { diffDays, monthEnd, monthOf, monthStart } from '../lib/dates';
import { message } from '../lib/errors';
import { formatInr, parseAmountToMinor } from '../lib/money';
import { nativeNotifier } from '../notify/native';
import { useColors } from '../theme';

const intOf = (t: string): number => (t.trim() === '' ? NaN : Number(t));

export function PlanScreen() {
  const { repos, today, version, changed } = useData();
  const c = useColors();
  const month = monthOf(today);

  const [salary, setSalaryState] = useState<SalaryRow | null>(null);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [saved, setSaved] = useState<{ id: number; localDate: string; amountMinor: number; note: string | null }[]>([]);
  const [plan, setPlan] = useState<ReturnType<typeof monthPlan> | null>(null);
  const [upcoming, setUpcoming] = useState<ReminderItem[]>([]);
  const [rem, setRem] = useState({ enabled: true, time: '09:00' });
  const [notifOn, setNotifOn] = useState<boolean | null>(null);

  // forms
  const [payDay, setPayDay] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [loanName, setLoanName] = useState('');
  const [emi, setEmi] = useState('');
  const [dedDay, setDedDay] = useState('');
  const [tenure, setTenure] = useState('');
  const [paid, setPaid] = useState('0');
  const [before, setBefore] = useState(1);
  const [targetText, setTargetText] = useState('');
  const [saveText, setSaveText] = useState('');
  const [timeText, setTimeText] = useState('09:00');

  const load = useCallback(async () => {
    const from = monthStart(month);
    const to = monthEnd(month);
    const [sal, ls, tg, sv, rows, days, settings] = await Promise.all([
      repos.getSalary(),
      repos.loans(),
      repos.savingsTargetMinor(),
      repos.savingsBetween(from, to),
      repos.expensesBetween(from, to),
      repos.dayStatusBetween(from, to),
      repos.reminderSettings(),
    ]);
    setSalaryState(sal);
    setLoans(ls);
    setTarget(tg);
    setSaved(sv);
    setRem(settings);
    setTimeText(settings.time);
    if (sal) {
      setPayDay(String(sal.payDay));
      setPayAmount(sal.amountMinor ? String(sal.amountMinor / 100) : '');
    }
    setTargetText(tg ? String(tg / 100) : '');
    const summary = monthSummary(rows, days, month, today);
    setPlan(
      monthPlan({
        salary: sal,
        loans: ls,
        month,
        spendingByCategory: categoryBreakdown(rows, from, to).map((x) => ({ category: x.category, totalMinor: x.totalMinor })),
        spendingEstimated: summary.knownDays < summary.elapsedDays,
        savedMinor: sv.reduce((s, x) => s + x.amountMinor, 0),
        targetMinor: tg,
      }),
    );
    const now = new Date();
    setUpcoming(
      buildReminders({ ...settings, today, nowMinutes: now.getHours() * 60 + now.getMinutes(), salary: sal, savingsTargetMinor: tg, loans: ls, horizonMonths: 3 }).slice(0, 4),
    );
    nativeNotifier.status().then((s) => setNotifOn(s.enabled)).catch(() => setNotifOn(null));
  }, [repos, today, month, version]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => Alert.alert('Could not load', message(e)));
    }, [load]),
  );

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    fn()
      .then(() => {
        after?.();
        changed();
      })
      .catch((e) => Alert.alert('Could not save', message(e)));

  const saveSalary = () => {
    const day = intOf(payDay);
    let amount: number | null = null;
    if (payAmount.trim()) {
      amount = parseAmountToMinor(payAmount);
      if (amount === null) {
        Alert.alert('Check the amount', 'Enter the salary like 50000, or leave it empty.');
        return;
      }
    }
    run(() => repos.setSalary(day, amount));
  };

  const addLoan = () => {
    const emiMinor = parseAmountToMinor(emi);
    if (emiMinor === null) {
      Alert.alert('Check the EMI', 'Enter the EMI amount like 2500.');
      return;
    }
    run(
      () => repos.addLoan({ name: loanName, emiMinor, deductionDay: intOf(dedDay), tenureMonths: intOf(tenure), paidCount: intOf(paid), remindDaysBefore: before, today }),
      () => {
        setLoanName('');
        setEmi('');
        setDedDay('');
        setTenure('');
        setPaid('0');
      },
    );
  };

  const removeLoan = (l: LoanRow) =>
    Alert.alert('Delete this loan?', `${l.name}. Its reminders will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => repos.deleteLoan(l.id)) },
    ]);

  const nextSalary = salary ? nextSalaryDate(salary, today) : null;
  const savedTotal = saved.reduce((s, x) => s + x.amountMinor, 0);

  return (
    <Page>
      <Title>Plan</Title>
      <Muted>Set these once. The app works out the rest and reminds you.</Muted>

      <Card>
        <Heading>Salary</Heading>
        {salary && nextSalary && (
          <Muted>
            Next salary day: {nextSalary} (in {diffDays(today, nextSalary)} days)
            {salary.amountMinor ? `, about ${formatInr(salary.amountMinor)}` : ''}
          </Muted>
        )}
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Salary day of the month (1-31)" value={payDay} onChangeText={setPayDay} keyboardType="number-pad" placeholder="e.g. 28" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Amount, rupees (optional)" value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder="e.g. 50000" />
          </View>
        </Row>
        <Row>
          <Button title="Save salary" onPress={saveSalary} />
          {salary && <Button title="Remove" kind="secondary" onPress={() => run(() => repos.clearSalary(), () => { setPayDay(''); setPayAmount(''); })} />}
        </Row>
        <Muted>A day the month does not have (like 31 in April) means the last day of that month.</Muted>
      </Card>

      <Card>
        <Heading>Loans and EMIs</Heading>
        {loans.length === 0 && <Muted>No loans added.</Muted>}
        {loans.map((l) => {
          const s = loanStatus(l, today);
          return (
            <View key={l.id} style={{ gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{l.name}</Text>
                <Text style={{ color: c.text, fontSize: 16 }}>{formatInr(l.emiMinor)} / month</Text>
              </Row>
              <Muted>Deducted on day {l.deductionDay} of each month</Muted>
              {s.finished ? (
                <Row>
                  <Muted>All {l.tenureMonths} instalments are done.</Muted>
                  <Badge text="FINISHED" tone="ok" />
                </Row>
              ) : (
                <>
                  <Text style={{ color: c.text, fontSize: 14 }}>
                    Instalment {s.nextInstallment} of {l.tenureMonths} · {s.remaining} left (incl. the next)
                  </Text>
                  <Progress percent={(s.paid / l.tenureMonths) * 100} />
                  <Muted>
                    Next: {s.nextDate} (in {s.daysToNext} days) · last EMI {s.endDate}
                  </Muted>
                  <Muted>{formatInr(s.remainingMinor)} of EMIs still to pay (count of instalments x EMI; interest is not tracked).</Muted>
                </>
              )}
              {!l.active && <Badge text="PAUSED: no reminders" />}
              <Row>
                <Button title={l.active ? 'Pause reminders' : 'Resume'} kind="secondary" onPress={() => run(() => repos.setLoanActive(l.id, !l.active))} />
                <Button title="Delete" kind="danger" onPress={() => removeLoan(l)} />
              </Row>
            </View>
          );
        })}
        <Heading>Add a loan</Heading>
        <Input label="Name" value={loanName} onChangeText={setLoanName} placeholder="e.g. Bike loan" />
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="EMI, rupees" value={emi} onChangeText={setEmi} keyboardType="decimal-pad" placeholder="e.g. 2500" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Deduction day (1-31)" value={dedDay} onChangeText={setDedDay} keyboardType="number-pad" placeholder="e.g. 5" />
          </View>
        </Row>
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Tenure, months" value={tenure} onChangeText={setTenure} keyboardType="number-pad" placeholder="e.g. 24" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="EMIs already paid" value={paid} onChangeText={setPaid} keyboardType="number-pad" placeholder="0 if new" />
          </View>
        </Row>
        <Muted>Remind me</Muted>
        <Row>
          {[0, 1, 2, 3].map((d) => (
            <Chip key={d} label={d === 0 ? 'On the day' : d === 1 ? '1 day before' : `${d} days before`} active={before === d} onPress={() => setBefore(d)} />
          ))}
        </Row>
        <Button title="Add loan" onPress={addLoan} />
      </Card>

      <Card>
        <Heading>Savings</Heading>
        <Input label="Monthly savings target, rupees (optional)" value={targetText} onChangeText={setTargetText} keyboardType="decimal-pad" placeholder="e.g. 5000" />
        <Row>
          <Button
            title="Save target"
            onPress={() => {
              const m = targetText.trim() ? parseAmountToMinor(targetText) : null;
              if (targetText.trim() && m === null) {
                Alert.alert('Check the amount', 'Enter the target like 5000.');
                return;
              }
              run(() => repos.setSavingsTargetMinor(m));
            }}
          />
          {target !== null && <Button title="Clear" kind="secondary" onPress={() => run(() => repos.setSavingsTargetMinor(null), () => setTargetText(''))} />}
        </Row>
        <Text style={{ color: c.text, fontSize: 16 }}>
          Saved in {month}: {formatInr(savedTotal)}
          {target ? ` of ${formatInr(target)}` : ''}
        </Text>
        {target ? <Progress percent={(savedTotal / target) * 100} /> : null}
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="I set aside (rupees)" value={saveText} onChangeText={setSaveText} keyboardType="decimal-pad" placeholder="e.g. 2000" />
          </View>
          <Button
            title="Add"
            onPress={() => {
              const m = parseAmountToMinor(saveText);
              if (m === null) {
                Alert.alert('Check the amount', 'Enter the amount like 2000.');
                return;
              }
              run(() => repos.addSavings(m), () => setSaveText(''));
            }}
          />
        </Row>
        {saved.map((x) => (
          <Pressable
            key={x.id}
            onLongPress={() => Alert.alert('Delete this savings entry?', `${formatInr(x.amountMinor)} on ${x.localDate}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => run(() => repos.deleteSavings(x.id)) }])}
            accessibilityHint="Long press to delete"
          >
            <Muted>
              {x.localDate} · {formatInr(x.amountMinor)}
              {x.note ? ` · ${x.note}` : ''}
            </Muted>
          </Pressable>
        ))}
        {plan && (
          <View style={{ gap: 4, paddingTop: 6 }}>
            <Heading>This month</Heading>
            <Muted>EMIs due this month: {formatInr(plan.emiMinor)}</Muted>
            <Muted>Other spending recorded: {formatInr(plan.otherSpendingMinor)} (EMI and Loan entries are left out so EMIs are not counted twice)</Muted>
            {plan.leftMinor !== null ? (
              <Row>
                <Text style={{ color: plan.leftMinor < 0 ? c.danger : c.text, fontSize: 16 }}>
                  Left from salary: {formatInr(plan.leftMinor)}
                </Text>
                {plan.estimated && <Badge text="ESTIMATE: some days not recorded" />}
              </Row>
            ) : (
              <Muted>Add your salary amount above to see what is left after EMIs and spending.</Muted>
            )}
          </View>
        )}
      </Card>

      <Card>
        <Heading>Reminders</Heading>
        <Row>
          <Chip label="On" active={rem.enabled} onPress={() => run(() => repos.setReminderSettings(true, rem.time))} />
          <Chip label="Off" active={!rem.enabled} onPress={() => run(() => repos.setReminderSettings(false, rem.time))} />
        </Row>
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Time of day (24 hour)" value={timeText} onChangeText={setTimeText} placeholder="09:00" />
          </View>
          <Button title="Save time" kind="secondary" onPress={() => run(() => repos.setReminderSettings(rem.enabled, timeText))} />
        </Row>
        {notifOn === false && (
          <Row>
            <Badge text="NOTIFICATIONS ARE BLOCKED" />
            <Button title="Allow notifications" onPress={() => nativeNotifier.requestPermission().then(() => setTimeout(() => load().catch(() => {}), 1500))} />
          </Row>
        )}
        {notifOn === true && <Muted>Notifications are allowed.</Muted>}
        <Muted>Coming up:</Muted>
        {upcoming.length === 0 && <Muted>No reminders scheduled. Add a salary day or a loan.</Muted>}
        {upcoming.map((u) => (
          <Text key={u.id} style={{ color: c.text, fontSize: 14 }}>
            • {u.date} {u.time} · {u.title}
          </Text>
        ))}
        <Muted>Reminders are set on this phone and need no internet. Android can deliver them a few minutes late when the battery saver is on.</Muted>
      </Card>
    </Page>
  );
}
