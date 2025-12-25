import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createDemoUsers() {
  const demoUsers = [
    {
      email: 'admin@celestar.com',
      password: 'admin123',
      role: 'admin' as const,
      org_id: 'org_001'
    },
    {
      email: 'supervisor@celestar.com',
      password: 'supervisor123',
      role: 'supervisor' as const,
      org_id: 'org_001'
    },
    {
      email: 'client@celestar.com',
      password: 'client123',
      role: 'client' as const,
      org_id: 'org_001'
    }
  ];

  for (const user of demoUsers) {
    try {
      // Create auth user using admin API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true
      });

      if (authError) {
        console.error(`Error creating auth user ${user.email}:`, authError);
        continue;
      }

      console.log(`✓ Created auth user: ${user.email} (ID: ${authData.user.id})`);

      // Check if user already exists in users table
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (existingUser) {
        // Update existing user with new auth UID
        const { error: updateError } = await supabase
          .from('users')
          .update({ uid: authData.user.id })
          .eq('email', user.email);

        if (updateError) {
          console.error(`Error updating user ${user.email}:`, updateError);
        } else {
          console.log(`✓ Updated user record for: ${user.email}`);
        }
      } else {
        // Insert new user record
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            uid: authData.user.id,
            email: user.email,
            role: user.role,
            org_id: user.org_id
          });

        if (insertError) {
          console.error(`Error inserting user ${user.email}:`, insertError);
        } else {
          console.log(`✓ Created user record for: ${user.email}`);
        }
      }
    } catch (error) {
      console.error(`Error processing user ${user.email}:`, error);
    }
  }

  console.log('\n✅ Demo users setup complete!');
  console.log('\nLogin credentials:');
  console.log('Admin: admin@celestar.com / admin123');
  console.log('Supervisor: supervisor@celestar.com / supervisor123');
  console.log('Client: client@celestar.com / client123');
}

createDemoUsers();
