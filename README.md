# LinkedIn Viral Studio

AI LinkedIn post studio: viral posts, carousel PDFs, smart comments, client hunting, and direct posting to LinkedIn.

- **GitHub Pages link** (https://shahzaibarshad8688-art.github.io/LinkedIn-viral-studio/): everything works except direct posting. Use the **"Open in LinkedIn"** button there.
- **Direct "Post to LinkedIn"** needs this repo's `server.js` running on a Node 18+ host (Render, Railway, Fly, VPS), because the LinkedIn Client Secret must stay on a server.

> There is **no "App Key"** to get from LinkedIn. That field in Settings is only for an old optional Worker. Leave it empty when you use `server.js`.

## Connect LinkedIn (step by step)

### 1. Create a LinkedIn developer app (free)
1. Open https://www.linkedin.com/developers/apps and click **Create app**.
2. Give it a name, a logo and your LinkedIn **Company Page**. If you don't have a page, create a free one first.
3. On the **Products** tab, add:
   - **Share on LinkedIn**
   - **Sign In with LinkedIn using OpenID Connect**
4. On the **Auth** tab, copy the **Client ID** and **Primary Client Secret**. Never commit the secret to GitHub.

### 2. Host the server (example: Render, free)
1. Go to https://render.com, sign in with GitHub, then **New → Web Service** and pick this repo.
2. Runtime: Node. Build command: leave empty. Start command: `npm start`.
3. Add these **Environment Variables**:
   - `LINKEDIN_CLIENT_ID` = your Client ID
   - `LINKEDIN_CLIENT_SECRET` = your Client Secret
   - `LINKEDIN_REDIRECT_URI` = `https://YOUR-APP.onrender.com/auth/linkedin/callback`
   - `NODE_ENV` = `production`
4. Back in the LinkedIn app, open **Auth → Authorized redirect URLs** and add exactly the same callback URL.

### 3. Connect
1. Open `https://YOUR-APP.onrender.com`. Use the Render link, not GitHub Pages.
2. Click **🔗 Connect LinkedIn** at the top and choose **Allow**.
3. **Post to LinkedIn** now publishes the post with its image directly.

## Notes
- LinkedIn tokens last about 60 days. Tokens are kept in server memory, so after a server restart (or after a free Render server sleeps) you need to click **Connect LinkedIn** again.
- Run locally: copy `env.example` to `.env`, fill in the values, run `npm start`, then open http://localhost:3000. Use `http://localhost:3000/auth/linkedin/callback` as the redirect URL. Use one hostname consistently (`localhost`, not `127.0.0.1`).
- Secrets live only in `.env` (git-ignored) or in your host's environment variables. The browser only holds an HttpOnly session cookie.
- Scheduled auto-posting runs in the browser tab, not on the server.
- Carousel PDFs are posted manually: LinkedIn → Start a post → ➕ → Add a document.
