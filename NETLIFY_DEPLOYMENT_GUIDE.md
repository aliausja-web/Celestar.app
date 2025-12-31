# Complete Netlify Deployment Guide
## From Local to Production with Custom Domain

This guide will take you from your current local setup to a fully deployed production portal with a custom domain.

---

## Part 1: Prepare Your Code for Deployment

### Step 1.1: Push Your Code to GitHub

If you haven't already, create a GitHub repository:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Create your first commit
git commit -m "Initial commit - Celestar Portal ready for deployment"

# Create a new repository on GitHub (visit https://github.com/new)
# Then link it to your local repository:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push your code
git push -u origin main
```

**If you already have a GitHub repo:** Just make sure your latest changes are pushed:
```bash
git add .
git commit -m "Fix deployment configuration"
git push
```

---

## Part 2: Deploy to Netlify

### Step 2.1: Create a Netlify Account

1. Go to [https://www.netlify.com](https://www.netlify.com)
2. Click "Sign up" in the top right
3. Choose "Sign up with GitHub" (recommended for easier deployment)
4. Authorize Netlify to access your GitHub repositories

### Step 2.2: Create a New Site

1. Once logged in, click the **"Add new site"** button
2. Select **"Import an existing project"**
3. Choose **"Deploy with GitHub"**
4. Authorize Netlify to access your repositories if prompted
5. Find and select your repository from the list
6. You'll see a configuration screen - **DON'T DEPLOY YET!**

### Step 2.3: Configure Build Settings

On the configuration screen, verify these settings:

- **Branch to deploy:** `main` (or `master` depending on your setup)
- **Build command:** `npx next build` (should be auto-detected)
- **Publish directory:** `.next` (should be auto-detected)

**IMPORTANT: Do NOT click "Deploy site" yet!** We need to add environment variables first.

### Step 2.4: Add Environment Variables

This is the most critical step. Scroll down to "Environment variables" section:

Click **"Add environment variables"** and add each of these one by one:

1. **NEXT_PUBLIC_FIREBASE_API_KEY**
   - Value: Copy from your `.env` file

2. **NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN**
   - Value: Copy from your `.env` file

3. **NEXT_PUBLIC_FIREBASE_PROJECT_ID**
   - Value: Copy from your `.env` file

4. **NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET**
   - Value: Copy from your `.env` file

5. **NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID**
   - Value: Copy from your `.env` file

6. **NEXT_PUBLIC_FIREBASE_APP_ID**
   - Value: Copy from your `.env` file

7. **NEXT_PUBLIC_SUPABASE_URL**
   - Value: Copy from your `.env` file
   - Should look like: `https://XXXXX.supabase.co`

8. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Value: Copy from your `.env` file
   - Should be a long JWT token starting with `eyJ...`

**Pro tip:** Open your `.env` file and copy-paste each value carefully to avoid typos.

### Step 2.5: Deploy Your Site

1. After adding all environment variables, click **"Deploy site"**
2. Netlify will start building your site
3. Watch the deploy logs (click on the deployment to see progress)
4. Wait 2-5 minutes for the build to complete

### Step 2.6: Verify Deployment

Once deployment is complete:

1. Netlify will show you a temporary URL like: `https://random-name-123456.netlify.app`
2. Click on the URL to open your site
3. Test the login page with your admin credentials:
   - Email: `admin@celestar.com`
   - Password: (the password from your Supabase setup)

---

## Part 3: Configure Firebase for Your New Domain

### Step 3.1: Add Netlify Domain to Firebase

Your Firebase authentication needs to know about your Netlify domain:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Click **"Add domain"**
5. Add your Netlify domain (e.g., `random-name-123456.netlify.app`)
6. Click **Add**

**Test again:** Try logging in now - it should work!

---

## Part 4: Set Up Custom Domain

### Step 4.1: Get a Domain Name

If you don't have a domain yet, purchase one from:
- [Namecheap](https://www.namecheap.com) (recommended, affordable)
- [Google Domains](https://domains.google)
- [GoDaddy](https://www.godaddy.com)
- Or any other domain registrar

**Domain suggestions:**
- `celestarportal.com`
- `yourcompany-celestar.com`
- `executiontracker.com`
- `projectstatus.io`

### Step 4.2: Add Custom Domain to Netlify

1. In your Netlify dashboard, go to your site
2. Click **"Domain settings"** (or "Set up a custom domain")
3. Click **"Add custom domain"**
4. Enter your domain (e.g., `celestarportal.com`)
5. Click **"Verify"**
6. If you own the domain, click **"Yes, add domain"**

### Step 4.3: Configure DNS Settings

Netlify will provide you with DNS configuration instructions. You have two options:

#### Option A: Use Netlify DNS (Recommended - Easiest)

1. Netlify will show you nameservers like:
   ```
   dns1.p01.nsone.net
   dns2.p01.nsone.net
   dns3.p01.nsone.net
   dns4.p01.nsone.net
   ```
2. Go to your domain registrar's dashboard
3. Find "DNS Settings" or "Nameservers"
4. Change nameservers to the ones Netlify provided
5. Save changes

**Note:** DNS changes can take 24-48 hours to propagate (usually much faster)

#### Option B: Use External DNS (Keep Your Current DNS Provider)

1. In Netlify, note the IP address or CNAME record provided
2. Go to your domain registrar's DNS settings
3. Add these records:

For apex domain (e.g., `celestarportal.com`):
- **Type:** A Record
- **Name:** @ (or leave blank)
- **Value:** The IP address Netlify provides
- **TTL:** 3600

For www subdomain:
- **Type:** CNAME
- **Name:** www
- **Value:** `your-site.netlify.app`
- **TTL:** 3600

### Step 4.4: Enable HTTPS

1. Wait for DNS to propagate (check with [https://dnschecker.org](https://dnschecker.org))
2. Netlify automatically provisions an SSL certificate
3. Once DNS is verified, Netlify will enable HTTPS (usually within minutes)
4. Force HTTPS: In Netlify, go to **Domain settings** → **HTTPS** → Enable "Force HTTPS"

### Step 4.5: Update Firebase with Your Custom Domain

1. Go back to [Firebase Console](https://console.firebase.google.com)
2. **Authentication** → **Settings** → **Authorized domains**
3. Click **"Add domain"**
4. Add your custom domain (e.g., `celestarportal.com`)
5. Also add the www version if you set it up: `www.celestarportal.com`
6. Click **Add**

---

## Part 5: Final Configuration and Testing

### Step 5.1: Test All User Roles

Visit your domain and test each user type:

**Admin Access:**
```
Email: admin@celestar.com
Password: [your admin password]
Expected: Full dashboard with all zones and escalation controls
```

**Supervisor Access:**
```
Email: supervisor@celestar.com
Password: [your supervisor password]
Expected: View-only access to projects and zones
```

**Client Access:**
```
Email: client@celestar.com
Password: [your client password]
Expected: Zone detail view with proof upload capability
```

### Step 5.2: Configure Supabase for Production

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Authentication** → **URL Configuration**
4. Add your custom domain to **Site URL**: `https://yourdomain.com`
5. Add redirect URLs:
   - `https://yourdomain.com/**`
   - `https://www.yourdomain.com/**`

### Step 5.3: Set Up Continuous Deployment

Your site is now configured for automatic deployments:

**Every time you push to GitHub:**
```bash
git add .
git commit -m "Update feature X"
git push
```

**Netlify automatically:**
1. Detects the push
2. Runs the build
3. Deploys the new version
4. Your changes go live in 2-5 minutes

---

## Part 6: Optional Enhancements

### 6.1: Custom Subdomain for Admin

Set up `admin.yourdomain.com`:

1. In Netlify, go to **Domain settings**
2. Add another custom domain: `admin.yourdomain.com`
3. Follow the same DNS setup process
4. Users can now access admin via: `https://admin.yourdomain.com/admin`

### 6.2: Email Notifications

To enable email notifications from your domain:

1. Set up email forwarding at your domain registrar
2. Configure SendGrid or another email service in Supabase
3. Update your Supabase email templates with your branding

### 6.3: Performance Monitoring

1. Enable Netlify Analytics:
   - Go to your site in Netlify
   - Click **"Analytics"**
   - Enable analytics (paid feature but worth it)

2. Add Google Analytics:
   - Get your GA tracking ID
   - Add it to your Next.js config

### 6.4: Set Up Preview Deployments

Already configured! Every branch/PR gets a preview URL:
```bash
git checkout -b feature/new-dashboard
# Make changes
git push -u origin feature/new-dashboard
```
Netlify creates a preview at: `feature-new-dashboard--your-site.netlify.app`

---

## Part 7: Troubleshooting

### Build Fails with "supabaseUrl is required"

**Solution:**
1. Check environment variables are set in Netlify
2. Verify no typos in variable names (they're case-sensitive!)
3. Make sure variables start with `NEXT_PUBLIC_`
4. Trigger a new deploy: **Deploys** → **Trigger deploy** → **Deploy site**

### Login Fails with "unauthorized-domain" Error

**Solution:**
1. Add your domain to Firebase Authorized Domains
2. Add both `yourdomain.com` AND `www.yourdomain.com`
3. Wait 1-2 minutes for Firebase to update
4. Clear browser cache and try again

### Custom Domain Not Working

**Solution:**
1. Check DNS propagation: [https://dnschecker.org](https://dnschecker.org)
2. Verify DNS records are correct in your registrar
3. Wait 24-48 hours (DNS can be slow)
4. Try accessing via `www.yourdomain.com` if apex domain fails

### HTTPS Certificate Pending

**Solution:**
1. Ensure DNS is fully propagated
2. In Netlify: **Domain settings** → **HTTPS** → **Verify DNS configuration**
3. Click **"Renew certificate"**
4. Wait 10-20 minutes

### Site Loads but Features Don't Work

**Solution:**
1. Open browser console (F12) → Check for errors
2. Verify all environment variables are set
3. Check Firebase authorized domains include your domain
4. Verify Supabase project is active

---

## Quick Reference: Essential URLs

Once deployed, bookmark these:

| Purpose | URL |
|---------|-----|
| **Admin Dashboard** | `https://yourdomain.com/admin` |
| **Supervisor View** | `https://yourdomain.com/supervisor` |
| **Client View** | `https://yourdomain.com/client` |
| **Netlify Dashboard** | `https://app.netlify.com` |
| **Firebase Console** | `https://console.firebase.google.com` |
| **Supabase Dashboard** | `https://app.supabase.com` |
| **Domain Registrar** | [Your registrar's website] |

---

## Need Help?

If you get stuck:

1. Check the build logs in Netlify (very detailed error messages)
2. Review Firebase Console for authentication errors
3. Check Supabase logs for database issues
4. Review the troubleshooting section above
5. Check that ALL environment variables are correctly set

---

## Summary Checklist

Before going live, ensure:

- [ ] Code pushed to GitHub
- [ ] Netlify site created and connected to GitHub
- [ ] All 8 environment variables added to Netlify
- [ ] Initial deployment successful
- [ ] Test login works on Netlify URL
- [ ] Firebase authorized domains includes Netlify URL
- [ ] Custom domain purchased (if needed)
- [ ] Custom domain added to Netlify
- [ ] DNS configured correctly
- [ ] SSL certificate active (HTTPS working)
- [ ] Custom domain added to Firebase authorized domains
- [ ] Custom domain added to Supabase URL configuration
- [ ] All three user roles tested on production
- [ ] Continuous deployment working (test with a small change)

**Congratulations! Your Celestar Portal is now live!** 🚀

Your users can now access a production-grade execution readiness verification system at your custom domain.
