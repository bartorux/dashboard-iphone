import React, { useEffect, useState } from 'react';

interface NotificationBannerProps {
  message: string | null;
}

/**
 * Toast under the app bar. Positioned against the safe-area inset plus the header
 * height, so it never slides underneath the notch or the header itself.
 */
const NotificationBanner: React.FC<NotificationBannerProps> = ({ message }) => {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!message) return;

    setText(message);
    setVisible(true);

    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      // The width cap keeps a one-line message from becoming a bar across a
      // 24-inch monitor. Being `fixed`, it centres on the viewport rather than
      // on the content column — which is where a transient message belongs.
      //
      // Written as an arbitrary value on purpose: Tailwind scans this file as
      // plain text, so a named size mentioned even in a comment would generate
      // the utility and its theme variable, and the stylesheet the phone sees
      // would stop being identical to the one it had.
      // transition-[transform,translate,opacity]: the -translate-y utility
      // below moves this banner through Tailwind v4's CSS `translate`
      // property, which is separate from `transform` under the
      // individual-transform-properties spec - naming only `transform` here
      // left the actual moving property untracked and the slide simply
      // snapped between positions with nothing to animate it. `transform`
      // stays in the list too: it costs nothing while unused today, and
      // keeps this correct if the motion is ever done as a transform instead.
      className={`pointer-events-none fixed inset-x-3 z-[1000] rounded-2xl bg-text px-4 py-3 text-center text-[0.875rem] font-medium text-bg shadow-lg transition-[transform,translate,opacity] duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)] md:mx-auto md:max-w-[28rem] ${
        // -translate-y-full, not a fraction: a banner with a longer message is
        // taller, and a fixed few-rem offset would only clear a short one,
        // leaving longer text visibly cut by the header on the way in.
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      style={{
        top: 'calc(env(safe-area-inset-top) + var(--header-height) + 0.5rem)',
      }}
    >
      {text}
    </div>
  );
};

export default NotificationBanner;
