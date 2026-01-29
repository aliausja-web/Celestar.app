import type { Config, Context } from '@netlify/functions';

// Netlify Scheduled Function - runs daily at 8 AM UTC
export default async (req: Request, context: Context) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    return new Response(JSON.stringify({ error: 'Missing configuration' }), {
      status: 500,
    });
  }

  try {
    // Call the Supabase Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/check-deadlines`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    console.log('Deadline check result:', result);

    return new Response(JSON.stringify(result), {
      status: response.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error running deadline check:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
};

// Schedule: Run daily at 8 AM UTC (adjust as needed)
export const config: Config = {
  schedule: '@daily',
};
