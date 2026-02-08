import React from 'react';
import { PULL_THRESHOLD_PX } from '../utils/constants';

interface PullToRefreshProps {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  isReady: boolean;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({
  pullDistance,
  isRefreshing,
  isPulling,
  isReady,
}) => {
  if (!isPulling && !isRefreshing) return null;

  const progress = Math.min(pullDistance / PULL_THRESHOLD_PX, 1);

  return (
    <div
      className="absolute top-[-80px] left-0 right-0 h-[80px] flex items-center justify-center bg-gradient-to-br from-[#c0392b] to-[#e74c3c] text-white font-semibold text-sm z-10 rounded-b-[15px] shadow-md transition-transform duration-300"
      style={{
        transform: `translateY(${pullDistance * 0.5}px)`,
        opacity: progress,
      }}
    >
      {isRefreshing ? (
        <>
          <div className="inline-block w-4 h-4 border-2 border-white/30 rounded-full border-t-white animate-spin mr-2" />
          Odświeżanie...
        </>
      ) : (
        <>
          <span
            className={`mr-2 text-lg transition-transform duration-300 ${
              isReady ? 'rotate-180' : ''
            }`}
          >
            {'\u2193'}
          </span>
          {isReady ? 'Puść aby odświeżyć' : 'Pociągnij aby odświeżyć'}
        </>
      )}
    </div>
  );
};

export default PullToRefresh;
