import { FormEvent, useState } from "react";
import { Modal } from "./Modal";

interface Props {
  title: string;
  initial?: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

/** Asks for a single name (create / rename playlist). Mount it only while it should be open. */
export function NameModal({ title, initial = "", confirmLabel, onConfirm, onClose }: Props) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Playlist name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
        </label>
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!trimmed}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
