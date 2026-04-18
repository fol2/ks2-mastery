# Social Sign-in Setup

This project keeps authentication on the Worker so the learning engine stays server-side. Providers redirect back to the Worker, the Worker exchanges the code, and only the Worker sets the `ks2_session` cookie.

## Callback URLs

Register these callback URLs exactly:

- Google: `https://ks2.eugnel.uk/api/auth/google/callback`
- Facebook: `https://ks2.eugnel.uk/api/auth/facebook/callback`
- X: `https://ks2.eugnel.uk/api/auth/x/callback`
- Apple: `https://ks2.eugnel.uk/api/auth/apple/callback`

Instagram is not enabled for the public family login flow. Meta documents Instagram Login for Instagram professional accounts only, which does not fit the general parent-and-child sign-in model for this app.

## Cloudflare secrets

Set provider secrets on the Worker with `wrangler secret put`.

### Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Facebook

- `FACEBOOK_CLIENT_ID`
- `FACEBOOK_CLIENT_SECRET`

### X

- `X_CLIENT_ID`

If your X app is configured as a confidential client and you want to keep the secret for future use, you may also store:

- `X_CLIENT_SECRET`

### Apple

- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`

`APPLE_CLIENT_ID` should be the Services ID for the website sign-in configuration.

## Provider notes

### Google

- Create an OAuth client for a web application.
- Add `https://ks2.eugnel.uk/api/auth/google/callback` as an authorised redirect URI.

### Facebook

- Add the Facebook Login product to the app.
- Under Facebook Login settings, add `https://ks2.eugnel.uk/api/auth/facebook/callback` to Valid OAuth Redirect URIs.
- Request `email` together with `public_profile`.

### X

- Turn on OAuth 2.0 in the app authentication settings.
- Add `https://ks2.eugnel.uk/api/auth/x/callback` as the callback URL.
- The Worker uses the authorisation code flow with PKCE.

### Apple

- Sign in with Apple for the web requires a Services ID tied to a primary App ID.
- Register `ks2.eugnel.uk` and `https://ks2.eugnel.uk/api/auth/apple/callback` in the Services ID configuration.
- Create a Sign in with Apple private key and store it in `APPLE_PRIVATE_KEY`.

## Current runtime behaviour

- Google, Facebook, X, and Apple buttons become active only when the required secrets are present.
- Email sign-in remains available.
- If a provider returns an email address that already belongs to an existing account, the identity is linked to that existing account.
- If a provider does not return an email address, the Worker creates a private placeholder account email internally and still keeps the identity in `user_identities`.
