import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { toLocalDateString } from './lib/dates';
import { migrate } from './db/migrations';
import { nativeDb } from './db/nativeDb';
import { Repos } from './db/repos';
import { nativeNotifier } from './notify/native';
import { syncReminders } from './notify/sync';

interface DataValue {
  repos: Repos;
  /** Today's date on the phone (YYYY-MM-DD). It updates by itself when the app returns after midnight. */
  today: string;
  /** Increases after every change so screens reload. */
  version: number;
  changed: () => void;
}

const Ctx = createContext<DataValue | null>(null);

export function useData(): DataValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useData must be used inside DataProvider');
  }
  return v;
}

/** Opens the database, runs the migrations, and only then shows the app. */
export function DataProvider({ children, fallback, failed }: { children: React.ReactNode; fallback: React.ReactNode; failed: (message: string) => React.ReactNode }) {
  const repos = useMemo(() => new Repos(nativeDb), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [today, setToday] = useState(() => toLocalDateString(new Date()));

  useEffect(() => {
    migrate(nativeDb)
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setToday(toLocalDateString(new Date()));
      }
    });
    return () => sub.remove();
  }, []);

  // Keep the phone's reminder schedule in step with the saved salary and loans: when the app opens, when the day
  // changes and after every change. A failure here never stops the app.
  useEffect(() => {
    if (ready) {
      syncReminders(repos, nativeNotifier).catch(() => {});
    }
  }, [ready, repos, today, version]);

  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ repos, today, version, changed }), [repos, today, version, changed]);

  if (error) {
    return <>{failed(error)}</>;
  }
  if (!ready) {
    return <>{fallback}</>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
