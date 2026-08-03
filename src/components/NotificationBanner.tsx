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
      className={`pointer-events-none fixed inset-x-3 z-[1000] rounded-2xl bg-text px-4 py-3 text-center text-[14px] font-medium text-bg shadow-lg transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'
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
