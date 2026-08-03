import React from 'react';
import { PULL_THRESHOLD_PX } from '../utils/constants';
import { ArrowDownIcon, RefreshIcon } from './icons';

interface PullToRefreshProps {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  isReady: boolean;
}

const INDICATOR_HEIGHT = 64;

const PullToRefresh: React.FC<PullToRefreshProps> = ({
  pullDistance,
  isRefreshing,
  isPulling,
  isReady,
}) => {
  if (!isPulling && !isRefreshing) return null;

  const progress = Math.min(pullDistance / PULL_THRESHOLD_PX, 1);
  // Travel the full distance: halving it left the indicator permanently
  // half-hidden above the fold, no matter how far the user pulled.
  const offset = isRefreshing
    ? INDICATOR_HEIGHT
    : Math.min(pullDistance, INDICATOR_HEIGHT);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center justify-center gap-2 text-[13px] font-medium text-text-secondary"
      style={{
        top: `-${INDICATOR_HEIGHT}px`,
        height: `${INDICATOR_HEIGHT}px`,
        transform: `translateY(${offset}px)`,
        opacity: isRefreshing ? 1 : progress,
      }}
    >
      {isRefreshing ? (
        <>
          <RefreshIcon className="h-4 w-4 animate-spin" />
          Odświeżanie…
        </>
      ) : (
        <>
          <ArrowDownIcon
            className={`h-4 w-4 transition-transform duration-300 ${
              isReady ? 'rotate-180' : ''
            }`}
          />
          {isReady ? 'Puść, aby odświeżyć' : 'Pociągnij, aby odświeżyć'}
        </>
      )}
    </div>
  );
};

export default PullToRefresh;
