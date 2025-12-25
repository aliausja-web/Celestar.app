import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://sqraglowxcgtdudyfbha.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxcmFnbG93eGNndGR1ZHlmYmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1ODM2MTksImV4cCI6MjA4MjE1OTYxOX0.uQl9Aa_unKF9hsiUl9u3-fYCrbkhc4GKhMAJqmkO0nE'
);

async function createAdminUser() {
  const email = 'aliausja@gmail.com';
  const password = 'admin123';
  const role = 'admin';
  const orgId = 'celestar';

  console.log('Creating admin user...');

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    console.error('Auth error:', authError);
    return;
  }

  if (!authData.user) {
    console.error('No user returned from signUp');
    return;
  }

  console.log('Auth user created:', authData.user.id);

  // Add to users table
  const { error: dbError } = await supabase.from('users').insert([
    {
      uid: authData.user.id,
      email,
      role,
      org_id: orgId,
    },
  ]);

  if (dbError) {
    console.error('Database error:', dbError);
    return;
  }

  console.log('✅ Admin user created successfully!');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Role:', role);
}

createAdminUser();
