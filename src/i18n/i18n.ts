import { en } from './en';
import { fa } from './fa';
import { UILanguage } from '../types/settings';

export type TranslationDict = typeof en;

export function getI18n(lang: UILanguage = 'fa'): TranslationDict {
  return lang === 'en' ? en : (fa as unknown as TranslationDict);
}

export function isRtl(lang: string): boolean {
  return lang === 'fa' || lang === 'ar';
}
