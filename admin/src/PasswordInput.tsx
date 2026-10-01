import { useState } from "react";

const EYE = ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"];
const EYE_OFF = [
  "M3 3l18 18",
  "M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9",
  "M6.6 7.6A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4-.9",
  "M9.9 9.9a3 3 0 0 0 4.2 4.2",
];

interface Props {
  name: string;
  autoComplete?: string;
  minLength?: number;
  placeholder?: string;
}

/** Password field with an eye button that reveals what was typed. */
export function PasswordInput(props: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input {...props} type={show ? "text" : "password"} required />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow(!show)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {(show ? EYE_OFF : EYE).map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </button>
    </div>
  );
}
