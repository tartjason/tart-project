# Tart

A platform for artists to showcase their work.

## Email sending (Resend)
We use Resend for transactional emails (OTP verification).

- Set the following in your private `.env`:
  - `RESEND_API_KEY`
  - `EMAIL_FROM_NAME`
  - `EMAIL_FROM_ADDRESS`
- Verify your sending domain in the Resend dashboard (SPF/DKIM). DMARC is recommended.
- Restart the server after updating env vars.

See `utils/email.js` for the email sender implementation and `routes/auth.js` for usage.

## Testing the OTP flow
- Request a code:
  ```bash
  curl -X POST http://localhost:3000/api/auth/otp/email/request \
    -H 'Content-Type: application/json' \
    -d '{"email":"you@example.com"}'
  ```
- Check the Resend dashboard and your inbox.
- Errors will be logged as “Email send error” from `routes/auth.js`.
