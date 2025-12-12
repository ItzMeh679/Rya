# YouTube OAuth Setup for Lavalink

This guide will help you set up YouTube OAuth to fix the "This video is unavailable" error.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click the **project dropdown** at the top (next to "Google Cloud")
4. Click **"New Project"**
5. Enter a name like `Rya Music Bot`
6. Click **Create**
7. Wait for the project to be created, then select it

## Step 2: Enable YouTube Data API

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for **"YouTube Data API v3"**
3. Click on it and press **Enable**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **"+ CREATE CREDENTIALS"** > **OAuth client ID**
3. If prompted, configure the **OAuth consent screen**:
   - Choose **External** (unless you have a Workspace account)
   - Enter App name: `Rya Music Bot`
   - Enter your email for support email
   - Add your email to developer contact
   - Click **Save and Continue** through all steps
4. Back in Credentials, click **"+ CREATE CREDENTIALS"** > **OAuth client ID**
5. Application type: **TV and Limited Input devices**
6. Name: `Rya Lavalink`
7. Click **Create**
8. **IMPORTANT:** Copy and save the **Client ID** and **Client Secret**

## Step 4: Get OAuth Refresh Token

You need to run a quick authorization flow to get a refresh token.

### Option A: Use the YouTube Plugin's Built-in OAuth Flow

1. Stop your Lavalink server (Ctrl+C)

2. Update your `application.yml` with:
```yaml
plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      - MUSIC
      - WEB
    oauth:
      enabled: true
      # For first-time setup, use device code flow:
      # Run Lavalink and check the logs for a URL to visit
```

3. Start Lavalink and check the terminal - it will show:
   - A URL to visit
   - A code to enter
4. Visit the URL, sign in, and enter the code
5. The refresh token will be saved automatically

### Option B: Manual Token Generation (If Option A doesn't work)

1. Visit this URL (replace YOUR_CLIENT_ID):
```
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/youtube
```

2. Sign in and authorize the app
3. Copy the authorization code
4. Exchange for tokens using PowerShell:
```powershell
$body = @{
    code = "YOUR_AUTH_CODE"
    client_id = "YOUR_CLIENT_ID"
    client_secret = "YOUR_CLIENT_SECRET"
    redirect_uri = "urn:ietf:wg:oauth:2.0:oob"
    grant_type = "authorization_code"
}
Invoke-RestMethod -Uri "https://oauth2.googleapis.com/token" -Method POST -Body $body
```
5. Copy the `refresh_token` from the response

## Step 5: Update application.yml with OAuth Token

Update your `f:\Rya\lavalink\application.yml`:

```yaml
plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      - MUSIC
      - WEB
    oauth:
      enabled: true
      refreshToken: "YOUR_REFRESH_TOKEN_HERE"
```

## Step 6: Restart Lavalink

1. Stop Lavalink (Ctrl+C)
2. Start it again: `.\start-lavalink.bat`
3. You should see: `YouTube OAuth token refreshed successfully`

---

## Troubleshooting

### "Token has been expired or revoked"
- Generate a new refresh token using the steps above

### "Access blocked: This app's request is invalid"
- Make sure you selected "TV and Limited Input devices" as the app type
- Check that YouTube Data API v3 is enabled

### "This video is unavailable" still appears
- Some videos are region-locked or age-restricted
- Try a different video to test

---

## Quick Reference

- **Google Cloud Console**: https://console.cloud.google.com/
- **YouTube Data API**: https://console.cloud.google.com/apis/library/youtube.googleapis.com
- **Credentials Page**: https://console.cloud.google.com/apis/credentials
