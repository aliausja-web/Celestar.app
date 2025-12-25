require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Not set');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAuthUsers() {
  const users = [
    {
      email: 'supervisor@celestar.com',
      password: 'supervisor123',
      id: 'c98efb8d-943f-4256-ba19-9a1e14ab03e5'
    },
    {
      email: 'admin@celestar.com',
      password: 'admin123',
      id: '4c218012-7915-4f2f-bf93-ac7c78078f0b'
    },
    {
      email: 'client@celestar.com',
      password: 'client123',
      id: 'a30985df-7db2-491f-ac69-a67f20a4d498'
    }
  ];

  console.log('Creating auth users...\n');

  for (const user of users) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {}
    });

    if (error) {
      console.error(`❌ Error creating ${user.email}:`, error.message);
    } else {
      console.log(`✓ Created ${user.email} (password: ${user.password})`);
    }
  }

  console.log('\nDone!');
}

createAuthUsers();
