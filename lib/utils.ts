import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toDate(dateValue: Date | string | null | undefined): Date {
  if (!dateValue) return new Date();
  if (typeof dateValue === 'string') return new Date(dateValue);
  return dateValue;
}
