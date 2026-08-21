# Reminder delivery — setup

Four steps, three of which happen outside this repo. Do them in order; the cron
schedule is last so nothing fires before the function can send.

## 1. SendGrid

1. Create an account at sendgrid.com (free tier: 100 emails/day).
2. **Settings → Sender Authentication → Single Sender Verification.** No domain
   needed — verify a personal address and use it as the sender. Click the link
   SendGrid emails you.
3. **Settings → API Keys → Create API Key**, restricted access with **Mail
   Send** permission only. Copy it (starts with `SG.`); it is shown once.

Deliverability without a verified domain is adequate for a small launch — some
clients show "via sendgrid.net" and the odd message lands in spam. Worth
revisiting when there's a real domain.

## 2. Function secrets

In the Supabase dashboard, **Edge Functions → Secrets** (or
`supabase secrets set NAME=value`):

| Secret | Value |
|---|---|
| `SENDGRID_API_KEY` | the `SG.…` key from step 1 |
| `SENDGRID_FROM` | the address verified in step 1 |
| `REMINDER_CRON_SECRET` | `ic8u6l8dbAYbBoxVohMbmFbz7Qu31am-ZWgmHFRS8O4` |
| `APP_URL` | `https://lovely100.girimanikandan-m.workers.dev` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not set them.

## 3. Deploy the function

```bash
supabase login
supabase link --project-ref ncxwdnxufivzrbizrzoi
supabase functions deploy send-reminders
```

Then check it end to end. It should return a JSON tally and send nothing,
because no reminder is due this minute:

```bash
curl -i -X POST \
  'https://ncxwdnxufivzrbizrzoi.supabase.co/functions/v1/send-reminders' \
  -H 'x-reminder-secret: ic8u6l8dbAYbBoxVohMbmFbz7Qu31am-ZWgmHFRS8O4'
```

Expect `{"due":0,"sent":0,"skipped":0,"failed":0}`. A 401 means the secret
doesn't match; a 500 means the migration hasn't been run.

## 4. Schedule it

Run the migration `20260821010000_reminders_delivery.sql` first, then this in
the SQL editor. It fires every five minutes; the function itself decides who is
actually due, and the `reminder_sends` ledger stops anything going out twice.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://ncxwdnxufivzrbizrzoi.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reminder-secret', 'ic8u6l8dbAYbBoxVohMbmFbz7Qu31am-ZWgmHFRS8O4'
      ),
      body    := '{}'::jsonb
    );
  $$
);
```

The header carries a purpose-built secret rather than the service-role key on
purpose: the schedule is stored in the database, and a leaked cron secret can
only cause reminder emails — never data access.

To inspect or remove it:

```sql
select jobid, schedule, jobname from cron.job;
select cron.unschedule('send-reminders');
```

## How it behaves

- Times are read in **Asia/Kolkata**, matching the India-only decision. No
  per-user timezone.
- A reminder is **skipped** when its habit is already done — a nudge about
  something you finished trains people to ignore the emails. The weekly review
  always sends.
- Only **confirmed** email addresses are mailed.
- Nothing sends before the challenge starts or after it ends.
- Every decision is recorded in `reminder_sends`, including skips and failures,
  so a failure isn't retried in a loop.

Check what happened:

```sql
select sent_for_date, reminder_type, status, detail, created_at
from reminder_sends order by created_at desc limit 20;
```

## Volume

One email per enabled reminder per person per day, minus everything skipped.
A couple keeping up generates very little; a couple struggling with all four
generates at most 8/day. SendGrid's free 100/day is roughly **25 couples** at
that worst case, comfortably more in practice. Upgrade at ~$20/month when it
gets close.
