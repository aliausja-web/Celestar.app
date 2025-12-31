# Celestar Deployment Guide

## Quick Deployment to Netlify

### Prerequisites
1. Supabase project set up with authentication and database configured
2. Environment variables ready from your `.env` file

### Step-by-Step Deployment

#### 1. Configure Environment Variables in Netlify

Before deploying, you must add environment variables to Netlify:

1. Go to your Netlify site dashboard
2. Navigate to **Site settings → Environment variables**
3. Add the following variables:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Important:** All values can be found in your local `.env` file.

#### 2. Deploy

**Option A: Via Netlify CLI**

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod
```

**Option B: Via Git (Automatic Deployment)**

1. Push code to GitHub:
```bash
git add .
git commit -m "Deploy to Netlify"
git push
```

2. Netlify will automatically build and deploy your site

#### 3. Verify Deployment

After deployment completes:

1. Visit your Netlify URL
2. Test login with demo accounts (see below)
3. Verify all features work correctly

### Demo Accounts

**Admin:**
- Email: admin@celestar.com
- Password: (configured in your Supabase database)

**Supervisor:**
- Email: supervisor@celestar.com
- Password: (configured in your Supabase database)

**Client:**
- Email: client@celestar.com
- Password: (configured in your Supabase database)

## Alternative: Deployment to Vercel

### Prerequisites
1. Firebase project set up with Auth, Firestore, and Storage enabled
2. Security rules deployed to Firebase (see README.md)
3. Seed data script run to populate demo data

### Step-by-Step Deployment

#### 1. Prepare Your Firebase Project

**Create Firebase Project:**
```bash
# Visit https://console.firebase.google.com
# Create a new project named "celestar-production"
```

**Enable Services:**
- Enable Authentication → Email/Password
- Create Firestore Database → Start in production mode
- Enable Storage

**Deploy Security Rules:**
1. Copy `firestore.rules` content to Firebase Console → Firestore → Rules
2. Copy `storage.rules` content to Firebase Console → Storage → Rules
3. Publish both

#### 2. Run Seed Data

Update your `.env` with production Firebase config, then:

```bash
npx tsx scripts/seed-data.ts
```

This creates:
- 3 demo users (admin, supervisor, client)
- 1 sample project (L'Oréal Mall Fit-Out)
- 8 zones with mixed statuses

#### 3. Deploy to Vercel

**Option A: Via Vercel CLI**

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Option B: Via GitHub + Vercel Dashboard**

1. Push code to GitHub:
```bash
git init
git add .
git commit -m "Initial Celestar deployment"
git remote add origin your-repo-url
git push -u origin main
```

2. Import to Vercel:
   - Visit https://vercel.com/new
   - Import your GitHub repository
   - Framework Preset: Next.js
   - Root Directory: ./

3. Add Environment Variables:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

4. Click "Deploy"

#### 4. Update Firebase Authentication Settings

After deployment, add your Vercel domain to Firebase:

1. Go to Firebase Console → Authentication → Settings
2. Add authorized domains:
   - `your-app.vercel.app`
   - `celestar.com` (if using custom domain)

#### 5. Test Deployment

Visit your deployed URL and login with:

**Admin:**
- Email: admin@celestar.com
- Password: admin123

**Supervisor:**
- Email: supervisor@celestar.com
- Password: supervisor123

**Client:**
- Email: client@celestar.com
- Password: client123

## Custom Domain Setup

### 1. Add Domain in Vercel

1. Go to your project → Settings → Domains
2. Add your domain (e.g., celestar.com)
3. Follow DNS configuration instructions

### 2. Update Firebase

Add your custom domain to Firebase authorized domains:
- Firebase Console → Authentication → Settings → Authorized domains
- Add: `celestar.com` and `www.celestar.com`

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API Key | `AIza...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID | `celestar-prod` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage Bucket | `project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID | `123456789` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID | `1:123:web:abc` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anonymous Key | `eyJhbGci...` |

## Production Checklist

- [ ] Firebase project created
- [ ] Authentication enabled (Email/Password)
- [ ] Firestore database created
- [ ] Storage enabled
- [ ] Security rules deployed (Firestore + Storage)
- [ ] Seed data script executed
- [ ] Environment variables configured in Vercel
- [ ] Domain added to Firebase authorized domains
- [ ] Test all three user roles after deployment
- [ ] Verify proof upload works from mobile
- [ ] Test escalation workflow

## Monitoring & Maintenance

**Firebase Console:**
- Monitor authentication users
- Check Firestore usage
- Review Storage usage
- Check security rule violations

**Vercel Dashboard:**
- Monitor deployment logs
- Check function execution times
- Review analytics

## Troubleshooting

**Issue: Build fails with "supabaseUrl is required" error**
- Solution: Make sure all environment variables are configured in Netlify dashboard under Site settings → Environment variables
- Verify variable names match exactly (case-sensitive)
- Redeploy after adding environment variables

**Issue: "Firebase: Error (auth/unauthorized-domain)"**
- Solution: Add your domain to Firebase Console → Authentication → Authorized domains

**Issue: "Permission denied" on Firestore reads/writes**
- Solution: Verify security rules are deployed correctly

**Issue: Storage upload fails**
- Solution: Check Storage rules and CORS configuration

**Issue: Users can't login**
- Solution: Verify Firebase Auth is enabled and environment variables are correct

**Issue: "Supabase environment variables are not configured" at runtime**
- Solution: Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in Netlify
- Check that variable names include the `NEXT_PUBLIC_` prefix

## Support

For deployment issues:
1. Check README.md for detailed setup
2. Review Firebase Console for errors
3. Check Vercel deployment logs
4. Verify all environment variables are set

---

**Production URL**: https://your-app.vercel.app
**Admin Console**: https://your-app.vercel.app/admin
