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
  const { signIn, user, userData, loading: authLoading } = useAuth();

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
    } else if (user && !userData && !authLoading) {
      // Only show error if we're done loading and still no profile
      console.error('User authenticated but no profile data found. Check console for details.');
      toast.error('Account setup incomplete. Please contact administrator.');
    }
  }, [user, userData, authLoading, router]);

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
    <div className="flex items-center justify-center min-h-screen bg-[#0E1116]">
      <div className="w-full max-w-md px-4">
        <div className="flex items-center justify-center gap-3 mb-8">
          {/* Celestar Logo - muted */}
          <div className="w-14 h-14 rounded bg-[#1a1f26] flex items-center justify-center border border-[#21262d]">
            <div className="grid grid-cols-2 gap-0.5 w-8 h-8">
              <div className="bg-red-500/70 rounded-tl"></div>
              <div className="bg-orange-500/70 rounded-tr"></div>
              <div className="bg-green-500/70 rounded-bl"></div>
              <div className="bg-blue-500/70 rounded-br"></div>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#e6edf3]">CELESTAR PORTAL</h1>
            <p className="text-sm text-[#7d8590]">Execution Readiness Verification</p>
          </div>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-[#e6edf3] font-medium">Login</CardTitle>
            <CardDescription className="text-[#7d8590]">Enter your credentials to access the portal</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#e6edf3] text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@celestar.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder:text-[#7d8590]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#e6edf3] text-sm">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder:text-[#7d8590]"
                />
              </div>
              <Button type="submit" className="w-full bg-[#1f6feb]/90 hover:bg-[#1f6feb] text-[#e6edf3]" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-[#0d1117] rounded border border-[#30363d]">
              <p className="text-xs text-[#7d8590] mb-3">Key Features:</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#58a6ff]/70 flex-shrink-0" />
                  <p className="text-xs text-[#7d8590] whitespace-nowrap">Timestamped proof capture with approval workflow</p>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-[#3fb950]/70 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#7d8590]">Separation of duties enforcement for proof validation</p>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-[#d29922]/70 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#7d8590]">Real-time status tracking with deadline monitoring</p>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#db6d28]/70 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#7d8590]">Automated escalation system for at-risk deliverables</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-xs text-[#7d8590]">Proof-first • Append-only audit • Rule-based escalation</p>
        </div>
      </div>
    </div>
  );
}
