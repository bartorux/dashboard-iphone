export function formatDate(date: Date): string {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:00:00`;
}

export function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatTime(timeStr: string): string {
  try {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timeStr;
  }
}

export function extractHour(timeStr: string): number {
  const match = timeStr.match(/(\d{2}):\d{2}:\d{2}$/);
  return match ? parseInt(match[1], 10) : -1;
}

export function getDayDate(offset: number): string {
  const today = new Date();
  const date = new Date(today.getTime() + offset * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}
