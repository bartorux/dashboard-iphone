import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Names the switch for assistive technology; the visible row label, repeated. */
  label: string;
}

/**
 * The iOS switch, the app's first: everything else in the settings is a
 * stepper, a segmented control or a plain row.
 *
 * A `button` with `role="switch"`, not a checkbox: the row it sits in is a
 * label already, and the platform announces on/off from `aria-checked`. Press
 * is answered at once — the knob moves on `pointerdown`, not after the click
 * resolves — because a control that waits reads as a control that missed.
 */
const Switch: React.FC<SwitchProps> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-8 w-[3.25rem] shrink-0 rounded-full transition-colors duration-200 active:scale-[0.97] ${
      checked ? 'bg-ok' : 'bg-sheet-field'
    }`}
  >
    <span
      aria-hidden
      className={`absolute left-0.5 top-0.5 h-7 w-7 rounded-full bg-white shadow transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        checked ? 'translate-x-5' : ''
      }`}
    />
  </button>
);

export default Switch;
