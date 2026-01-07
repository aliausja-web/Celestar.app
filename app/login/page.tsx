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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn, user, userData } = useAuth();

  useEffect(() => {
    if (user && userData) {
      // RBAC: Route based on new role system
      const role = userData.role?.toLowerCase();

      if (role === 'platform_admin' || role === 'program_owner') {
        router.push('/programs'); // Main programs page for admins and owners
      } else if (role === 'workstream_lead') {
        router.push('/programs'); // Workstream leads also see programs (filtered by RLS)
      } else if (role === 'field_contributor') {
        router.push('/programs'); // Field contributors see programs (read-only mostly)
      } else if (role === 'client_viewer') {
        router.push('/programs'); // Clients see assigned programs only
      } else {
        // Fallback for legacy roles
        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'supervisor') {
          router.push('/supervisor');
        } else if (role === 'client') {
          router.push('/client');
        }
      }
    } else if (user && !userData) {
      // User is authenticated but has no profile record
      console.error('User authenticated but no profile data found. Check console for details.');
      toast.error('Account setup incomplete. Please contact administrator.');
    }
  }, [user, userData, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signIn(email, password);
      toast.success('Logged in successfully');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Failed to log in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#0b0f14] via-[#121b26] to-[#0b0f14]">
      <div className="w-full max-w-md px-4">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-black text-black">C</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">CELESTAR PORTAL</h1>
            <p className="text-sm text-gray-400">Execution Readiness Verification</p>
          </div>
        </div>

        <Card className="border-gray-800 bg-[#0f1620]/90 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">Login</CardTitle>
            <CardDescription>Enter your credentials to access the portal</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@celestar.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-black/25 border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-black/25 border-gray-700"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-black/25 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-400 mb-3 font-semibold">Key Features:</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Camera className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-500">Timestamped photo & video proof capture with approval workflow</p>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-500">Separation of duties enforcement for proof validation</p>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-500">Real-time status tracking with deadline monitoring</p>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-500">Automated escalation system for at-risk deliverables</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">Proof-first • Append-only audit • Rule-based escalation</p>
        </div>
      </div>
    </div>
  );
}
