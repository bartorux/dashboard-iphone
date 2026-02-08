import React from 'react';

const Header: React.FC = React.memo(() => (
  <div className="bg-gradient-to-br from-[#c0392b] to-[#e74c3c] text-white px-4 py-5 text-center sticky top-0 z-50 shadow-md">
    <h1 className="m-0 mb-2 text-lg font-semibold leading-tight">
      PSE Dashboard
    </h1>
    <p className="m-0 text-sm text-white/90 leading-snug">
      Monitoring rezerw mocy KSE
    </p>
  </div>
));

Header.displayName = 'Header';
export default Header;
