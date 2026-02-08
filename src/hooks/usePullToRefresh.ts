import { useState, useRef, useCallback, useEffect } from 'react';
import { PULL_THRESHOLD_PX } from '../utils/constants';

interface UsePullToRefreshReturn {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  isReady: boolean;
}

export function usePullToRefresh(
  onRefresh: () => Promise<void>
): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const isReady = pullDistance >= PULL_THRESHOLD_PX;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshingRef.current) return;
    if (window.scrollY === 0) {
      startYRef.current = e.touches[0].clientY;
      isDraggingRef.current = false;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isRefreshingRef.current || window.scrollY > 0) return;
    if (startYRef.current <= 0) return;

    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startYRef.current);

    if (distance > 10) {
      isDraggingRef.current = true;
      e.preventDefault();
      setPullDistance(distance);
      setIsPulling(true);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (isRefreshingRef.current) return;

    if (isDraggingRef.current) {
      if (pullDistance >= PULL_THRESHOLD_PX) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);

        onRefresh().finally(() => {
          setTimeout(() => {
            setPullDistance(0);
            setIsPulling(false);
            setIsRefreshing(false);
            isRefreshingRef.current = false;
          }, 1000);
        });
      } else {
        setPullDistance(0);
        setIsPulling(false);
      }
    }

    startYRef.current = 0;
    isDraggingRef.current = false;
  }, [pullDistance, onRefresh]);

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    document.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing, isPulling, isReady };
}
