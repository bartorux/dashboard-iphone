import React, { useEffect, useState } from 'react';

interface NotificationBannerProps {
  message: string | null;
}

const NotificationBanner: React.FC<NotificationBannerProps> = ({
  message,
}) => {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (message) {
      setText(message);
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div
      className={`fixed top-[60px] left-4 right-4 bg-[#ff3b30] text-white px-4 py-3 rounded-[10px] font-semibold text-center z-[1000] shadow-[0_4px_12px_rgba(255,59,48,0.4)] transition-transform duration-300 ${
        visible ? 'translate-y-0' : '-translate-y-[100px]'
      }`}
    >
      {text}
    </div>
  );
};

export default NotificationBanner;
