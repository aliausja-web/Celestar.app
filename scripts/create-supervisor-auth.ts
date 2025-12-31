import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createSupervisorAuth() {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: 'supervisor@celestar.com',
    password: 'supervisor123',
    email_confirm: true,
    user_metadata: {}
  });

  if (error) {
    console.error('Error creating supervisor auth:', error);
    return;
  }

  console.log('Supervisor auth account created successfully!');
  console.log('Email: supervisor@celestar.com');
  console.log('Password: supervisor123');
  console.log('User ID:', data.user.id);
}

createSupervisorAuth();
