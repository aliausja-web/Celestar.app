'use client';

import { useLocale } from '@/lib/i18n/context';
import { type Locale } from '@/lib/i18n/messages';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

const LOCALES: { code: Locale; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] gap-1.5 px-2"
          title={t('language.label')}
        >
          <Globe className="w-4 h-4" />
          <span className="text-xs font-medium">{current.native}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-[#161b22] border-[#30363d] min-w-[140px]"
      >
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLocale(l.code)}
            className={`cursor-pointer text-sm ${
              l.code === locale
                ? 'text-[#58a6ff] bg-[#1f2937]'
                : 'text-[#e6edf3] hover:bg-[#21262d]'
            }`}
          >
            <span className="mr-2 rtl:ml-2 rtl:mr-0">{l.native}</span>
            {l.code === locale && <span className="text-[#58a6ff] ml-auto rtl:mr-auto rtl:ml-0">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
