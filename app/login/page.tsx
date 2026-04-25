'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, Clock, Camera, AlertTriangle } from 'lucide-react';
import { useLocale } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn, user, userData, loading: authLoading } = useAuth();
  const { t } = useLocale();

  useEffect(() => {
    if (user && userData) {
      const role = userData.role?.toLowerCase();
      if (role === 'platform_admin' || role === 'program_owner') {
        router.push('/programs');
      } else if (role === 'workstream_lead') {
        router.push('/programs');
      } else if (role === 'field_contributor') {
        router.push('/programs');
      } else if (role === 'client_viewer') {
        router.push('/programs');
      } else {
        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'supervisor') {
          router.push('/supervisor');
        } else if (role === 'client') {
          router.push('/client');
        }
      }
    }
  }, [user, userData, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const loginEmail = email.includes('@')
        ? email
        : `${email.trim().toLowerCase()}@field.celestar.internal`;
      await signIn(loginEmail, password);
      toast.success(t('login.successToast'));
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || t('login.errorToast'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0E1116]">
      {/* Language switcher - top right */}
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md px-4">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-14 h-14 rounded bg-[#1a1f26] flex items-center justify-center border border-[#21262d]">
            <div className="grid grid-cols-2 gap-0.5 w-8 h-8">
              <div className="bg-red-500/70 rounded-tl"></div>
              <div className="bg-orange-500/70 rounded-tr"></div>
              <div className="bg-green-500/70 rounded-bl"></div>
              <div className="bg-blue-500/70 rounded-br"></div>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#e6edf3]">{t('login.title')}</h1>
            <p className="text-sm text-[#7d8590]">{t('login.subtitle')}</p>
          </div>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-[#e6edf3] font-medium">{t('login.heading')}</CardTitle>
            <CardDescription className="text-[#7d8590]">{t('login.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#e6edf3] text-sm">{t('login.emailLabel')}</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder:text-[#7d8590]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#e6edf3] text-sm">{t('login.passwordLabel')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder:text-[#7d8590]"
                />
              </div>
              <Button type="submit" className="w-full bg-[#1f6feb]/90 hover:bg-[#1f6feb] text-[#e6edf3]" disabled={loading}>
                {loading ? t('login.loggingIn') : t('login.loginButton')}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-[#0d1117] rounded border border-[#30363d]">
              <p className="text-xs text-[#7d8590] mb-3">{t('login.featuresHeading')}</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#58a6ff]/70 flex-shrink-0" />
                  <p className="text-xs text-[#7d8590]">{t('login.feature1')}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-[#3fb950]/70 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#7d8590]">{t('login.feature2')}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-[#d29922]/70 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#7d8590]">{t('login.feature3')}</p>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#db6d28]/70 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#7d8590]">{t('login.feature4')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-xs text-[#7d8590]">{t('login.footer')}</p>
        </div>
      </div>
    </div>
  );
}
