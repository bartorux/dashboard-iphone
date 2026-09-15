import { describe, it, expect } from 'vitest';
import { parseThreshold, stepThreshold } from '../thresholdInput';

describe('parseThreshold', () => {
  it('accepts a whole number inside the bounds and on the right side of the other threshold', () => {
    expect(parseThreshold('orange', '650', 300)).toEqual({ value: 650, error: null });
    expect(parseThreshold('red', ' 250 ', 500)).toEqual({ value: 250, error: null });
  });

  it('accepts the bounds themselves, as the hook does', () => {
    expect(parseThreshold('red', '0', 500).error).toBeNull();
    expect(parseThreshold('red', '1500', 2000).error).toBeNull();
    expect(parseThreshold('orange', '2000', 300).error).toBeNull();
    expect(parseThreshold('orange', '1', 0).error).toBeNull();
  });

  it('refuses just outside them', () => {
    expect(parseThreshold('red', '1501', 2000).error).toBe('Wpisz wartość od 0 do 1500 MW');
    expect(parseThreshold('orange', '2001', 300).error).toBe('Wpisz wartość od 1 do 2000 MW');
    expect(parseThreshold('orange', '0', 0).error).toBe('Wpisz wartość od 1 do 2000 MW');
  });

  it('refuses an empty field', () => {
    expect(parseThreshold('orange', '  ', 300).error).toBe('Wpisz wartość w MW');
  });

  it('refuses what Number() would have let through', () => {
    for (const text of ['1e3', '450.5', '-5', '0x1F', '12 3', '+400']) {
      expect(parseThreshold('orange', text, 300).error).toBe('Wpisz liczbę całkowitą MW');
    }
  });

  it('keeps Alarm below Uwaga, naming the other value', () => {
    expect(parseThreshold('orange', '300', 300).error).toBe('Musi być wyższy niż próg Alarm (300 MW)');
    expect(parseThreshold('red', '500', 500).error).toBe('Musi być niższy niż próg Uwaga (500 MW)');
  });
});

describe('stepThreshold', () => {
  it('lands on the next multiple in the direction pressed', () => {
    expect(stepThreshold(437, 1, 50)).toBe(450);
    expect(stepThreshold(437, -1, 50)).toBe(400);
  });

  it('moves a full step from a value already on the grid', () => {
    expect(stepThreshold(500, 1, 50)).toBe(550);
    expect(stepThreshold(500, -1, 50)).toBe(450);
  });
});
