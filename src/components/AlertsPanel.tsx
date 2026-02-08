import React from 'react';
import { AlertSet } from '../types';
import { DAY_NAMES } from '../utils/constants';
import { formatTime } from '../utils/dateHelpers';

interface AlertsPanelProps {
  alerts: AlertSet;
  currentDayOffset: number;
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  currentDayOffset,
}) => {
  const totalAlerts = alerts.orange.length + alerts.red.length;
  const dayName = DAY_NAMES[currentDayOffset as 0 | 1 | 2] ?? '';

  return (
    <div className="bg-white p-3 max-h-[40vh] overflow-y-auto">
      <div className="flex items-center mb-3">
        <h3 className="m-0 text-base font-semibold">
          Alerty - {dayName}
        </h3>
        {totalAlerts > 0 && (
          <div className="bg-[#ff3b30] text-white text-xs px-1.5 py-0.5 rounded-[10px] ml-2 min-w-[16px] text-center">
            {totalAlerts}
          </div>
        )}
      </div>

      {totalAlerts === 0 ? (
        <div className="text-center py-5 text-[#8e8e93]">
          Brak alertów w tym dniu
        </div>
      ) : (
        <div>
          {alerts.red.map((alert, i) => (
            <div
              key={`red-${i}`}
              className="px-3 py-2 my-1 rounded-lg text-[13px] bg-[#ffebee] border-l-[3px] border-l-[#ff3b30]"
            >
              <strong>{formatTime(alert.time)}</strong>
              <br />
              Rezerwa: {alert.reserve.toFixed(0)} MW | Wymagana:{' '}
              {alert.required.toFixed(0)} MW
              <br />
              <small>Margines: {alert.difference.toFixed(0)} MW</small>
            </div>
          ))}
          {alerts.orange.map((alert, i) => (
            <div
              key={`orange-${i}`}
              className="px-3 py-2 my-1 rounded-lg text-[13px] bg-[#fff8e1] border-l-[3px] border-l-[#ff9500]"
            >
              <strong>{formatTime(alert.time)}</strong>
              <br />
              Rezerwa: {alert.reserve.toFixed(0)} MW | Wymagana:{' '}
              {alert.required.toFixed(0)} MW
              <br />
              <small>Margines: {alert.difference.toFixed(0)} MW</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;
