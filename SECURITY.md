# Security Policy

## Reporting

Do not open a public issue for a suspected vulnerability, credential leak, or
privacy incident. Use GitHub private vulnerability reporting for this
repository. Include the affected revision, reproduction steps, observed
impact, and expected behavior without including real credentials or personal
data.

## Workspace human-authentication boundary (ADR-2608302125)

This project is a declared first-party public human-authentication surface and
client. The workspace root `SECURITY.md` and ADR-2608302125 are mandatory and
this file may not weaken them.

- The only permitted active human-authentication method is a WebAuthn Passkey
  with exact RP ID and Origin binding, server-issued single-use challenge,
  replay protection, and user verification.
- Email, password, SMS/voice, OAuth/OIDC/SAML/social/enterprise SSO, support
  decisions, operator resets, and administrator overrides must not
  authenticate, bootstrap, step up, register or replace a credential, recover
  an account, or mint/upgrade a human session.
- If Passkey authentication is unavailable, fail closed. Provider secrets,
  legacy records, flags, or tenant settings must not enable a fallback.
- Recovery replaces a credential and never directly creates a session. It
  requires a one-time offline recovery secret, verifier-only storage, at least
  48 hours of server-enforced delay, and a fresh Passkey. Operators may freeze
  an account but cannot bypass the delay or grant identity.
- Closed legacy routes return 404 or 410 without ceremony, redirect, token,
  session, or credential issuance. Source, built application, and live-route
  negative tests must include plausible legacy configuration.

Policy alignment is not runtime proof. `auth.kotoba.cloud` remains
**unverified** under this policy until its current source, built artifact, and
live routes have all been negatively verified against prohibited fallback
methods.

## Scope distinction

Email, SMS, and federation may be used only after strong authentication for
notification, contact, or data connectivity. They must not mint or upgrade a
human session. Protocol implementation alone is not human-authentication
authority.
