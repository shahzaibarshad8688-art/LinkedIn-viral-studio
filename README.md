# LinkedIn Viral Studio — with LinkedIn publishing
Run: `cp .env.example .env` → fill LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET → `npm start` → open http://localhost:3000
Secrets live only in `.env` (git-ignored) or your host's environment variables. Tokens are kept in server memory; the browser only holds an HttpOnly session cookie.
LinkedIn app: Products = "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect"; Redirect URL = value of LINKEDIN_REDIRECT_URI.
Hosting: needs any Node 18+ host (Render, Railway, Fly, VPS). GitHub Pages alone cannot publish (no place for secrets). Use ONE hostname consistently (localhost, not 127.0.0.1).
Scheduling is NOT implemented (needs persistent token storage + a job runner; member tokens last ~60 days with no refresh for self-serve apps).
