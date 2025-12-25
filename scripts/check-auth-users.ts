import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkAuthUsers() {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.error('Error listing users:', error);
    return;
  }

  console.log('\nAuth Users:');
  console.log('===========');
  data.users.forEach(user => {
    console.log(`- ${user.email} (ID: ${user.id})`);
  });

  // Also check users table
  const { data: usersData, error: usersError } = await supabase
    .from('users')
    .select('uid, email, role');

  if (usersError) {
    console.error('\nError fetching users table:', usersError);
  } else {
    console.log('\nUsers Table:');
    console.log('============');
    usersData.forEach((user: any) => {
      console.log(`- ${user.email} (UID: ${user.uid}, Role: ${user.role})`);
    });
  }
}

checkAuthUsers();
