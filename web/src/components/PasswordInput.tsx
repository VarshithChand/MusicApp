import { useState } from "react";
import { Icon } from "./Icon";

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
        <Icon name={show ? "eyeOff" : "eye"} size={22} />
      </button>
    </div>
  );
}
