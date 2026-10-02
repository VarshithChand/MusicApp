import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";

/** Loads data on mount and whenever `reload` is called. */
export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

/** Wraps a submit handler with busy state and an ok/error message. */
export function useSubmit(action: (fd: FormData) => Promise<unknown>, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    // Drop untouched optional fields: an empty select/file would otherwise be sent as "" / an empty file.
    for (const [k, v] of Array.from(fd.entries())) {
      if (v === "" || (v instanceof File && v.size === 0)) fd.delete(k);
    }
    setBusy(true);
    setMsg(null);
    try {
      await action(fd);
      formEl.reset();
      setMsg({ kind: "ok", text: "Saved." });
      onDone();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, submit };
}

export function Msg({ msg }: { msg: { kind: "ok" | "error"; text: string } | null }) {
  return msg ? (
    <span className={`msg ${msg.kind}`} role="status">
      {msg.text}
    </span>
  ) : null;
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
