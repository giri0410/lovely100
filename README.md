# Our 100 Days

Build a modern, professional, mobile-first web app called “100 Days Together” for a husband and wife to complete a 100-day lifestyle challenge together.

The app should focus on health, healthy eating, financial discipline, and personal growth. Both partners should be able to track their daily progress, see each other's completion status, and stay motivated throughout the 100 days.

Core Challenge

The challenge has 4 daily habits:

Morning Walk

Complete a daily walk.

Target: 30 minutes.

Allow the user to mark it as completed.

Optional: record walking duration.

Healthy Food

Monday to Saturday: follow the planned diet.

Sunday: allowed as a cheat day.

Even on Sunday, encourage avoiding outside food and having the cheat meal at home.

Track daily food status.

Avoid Unnecessary Expenses

Users should record unnecessary purchases they avoided.

Definition: an expense that is not actually necessary at the moment.

Allow users to optionally enter:

Amount avoided

What they wanted to purchase

Reason they decided not to spend

Show total money saved through avoided unnecessary expenses.

Daily Certification

Spend time every day learning/studying for a certification.

Target: minimum 30 minutes.

Allow users to record:

Study duration

Topic studied

Optional notes

Show total study hours across the challenge.

Couple Experience

The app is designed for two people: Me and Wife.

Create two user profiles:

Me

Wife

Each person should have their own daily checklist while also being able to see the partner's progress.

Example:

Today — Day 27

HabitMeWifeMorning Walk✓✓Healthy Food✓✓No Unnecessary Spending✓—Certification✓✓

Show encouraging messages when both partners complete their goals.

Examples:

“Great job! Both of you completed today.”

“You're building this habit together.”

“One more day closer to 100!”

Dashboard

Create a beautiful dashboard as the main screen.

At the top show:

100 DAYS TOGETHER

“Small habits. Better health. Stronger discipline. Together.”

Show:

Current Day: Day 27 / 100

Days Completed

Overall Completion %

Current Streak

Best Streak

Money Saved

Total Certification Hours

Create a circular or linear 100-day progress indicator.

Example:

27 / 100 Days Completed

███████░░░░░░░░░░░ 27%

Today's Dashboard

Make today's checklist the primary interaction.

Display:

Day 27 — Tuesday, August 18

Today's Goals

☐ Morning Walk
30 minutes

☐ Healthy Food
Follow today's diet

☐ No Unnecessary Spending
Avoid unnecessary purchases

☐ Certification
30+ minutes

Each habit should have a clear Complete button.

When completed, show a satisfying micro-animation and update the daily progress.

At the bottom:

Today's Progress — 75%

100-Day Calendar

Create a calendar/grid showing all 100 days.

Each day should have a status:

Completed

Partially completed

Missed

Today

Future

Use subtle visual indicators rather than excessive colors.

Clicking a day should open its details.

Example:

Day 18

Morning Walk ✓

Healthy Food ✓

No Unnecessary Spending ✓

Certification ✕

Allow users to edit historical entries if necessary.

Habit Statistics

Create a statistics page.

Show separate statistics for:

Morning Walk

Total days completed

Completion percentage

Current streak

Longest streak

Healthy Food

Healthy days

Cheat Sundays

Diet consistency %

Financial Discipline

Unnecessary expenses avoided

Total money saved

Number of purchases avoided

Monthly savings chart

Certification

Total study hours

Average daily study time

Days studied

Longest study streak

Financial Tracking

Create a simple section called:

Money We Didn't Spend

Allow users to add an avoided expense.

Example:

Amount: ₹1,200
Purchase: Restaurant dinner
Reason: Cooked at home
Date: August 18

Show:

Total Avoided Spending

₹12,450

Also show a monthly breakdown.

Do NOT treat avoided spending as actual bank savings. Label it clearly as:

“Potential money saved by avoiding unnecessary purchases.”

Couple Leaderboard

Do not create a competitive leaderboard between husband and wife.

Instead create a Team Score.

Example:

Our Team Score

82%

Me: 84%
Wife: 80%

Together: 82%

The goal should always feel collaborative rather than competitive.

Streak System

Create:

🔥 Current Streak
🔥 Best Streak

A streak should be based on completing all 4 daily habits.

Also show individual habit streaks.

If one partner misses a habit, don't reset the entire couple's progress. Clearly show who missed what.

Weekly Review

Every Sunday, show a weekly summary.

Example:

Week 4 Complete 🎉

Morning Walk
6 / 7 days

Healthy Food
6 healthy days + 1 cheat day

Unnecessary Spending
₹2,350 avoided

Certification
5h 20m

Overall
89%

Then show:

What went well?

Allow both partners to add a short note.

What should we improve next week?

Allow both partners to add a note.

100-Day Milestones

Create milestone celebrations at:

Day 7
Day 14
Day 30
Day 50
Day 75
Day 100

Example:

🎉 30 Days Together!

“You've completed 30 days of building better habits together.”

Use tasteful animations for milestone completion.

Day 100 Final Summary

After completing 100 days, create a beautiful final report.

Show:

100 DAYS COMPLETED ❤️

Morning Walk:
XX / 100 days

Healthy Food:
XX / 100 days

Money Avoided:
₹XX,XXX

Certification:
XX hours

Overall Completion:
XX%

Best Streak:
XX days

Also show a side-by-side couple summary:

Me

Completion %

Walks

Healthy days

Study hours

Wife

Completion %

Walks

Healthy days

Study hours

Then show:

Our 100-Day Journey

Create a visual timeline of the challenge.

Notifications / Reminders

Create reminder settings for:

Morning walk

Certification study

Daily habit completion

Weekly Sunday review

Allow users to enable/disable reminders.

Do not hardcode notification times. Make them configurable in Settings.

UI / UX

Design should feel:

Premium

Minimal

Warm

Motivational

Modern

Mobile-first

Easy to use in under 30 seconds per day

Use a clean dashboard with cards, progress indicators, streaks and subtle animations.

Avoid making it look like a corporate productivity application.

The emotional feeling should be:

“We're doing this together.”

Use encouraging copy instead of aggressive productivity language.

Navigation

Mobile bottom navigation:

Today

Calendar

Stats

Money

Settings

Desktop can use a left sidebar.

Data Model

Use Supabase for persistence.

Create tables for:

users

id

name

relationship

avatar

created_at

challenge

id

name

start_date

end_date

duration

created_at

daily_habits

id

challenge_id

user_id

date

walk_completed

walk_duration

healthy_food_completed

unnecessary_spending_completed

certification_completed

certification_minutes

notes

created_at

updated_at

avoided_expenses

id

user_id

date

amount

description

reason

created_at

weekly_reviews

id

challenge_id

week_number

user_id

what_went_well

what_to_improve

created_at

reminders

id

user_id

reminder_type

enabled

reminder_time

Authentication

Create simple authentication so both partners can have separate accounts.

The challenge should connect the two accounts as a couple.

Use secure authentication and ensure one partner cannot access unrelated users' data.

Important Business Rules

Challenge duration is exactly 100 days.

Sunday is always treated as the planned cheat day.

Sunday should still encourage avoiding outside food.

A missed habit should not delete historical progress.

Streaks should be calculated automatically.

Money avoided must be shown separately from actual savings.

Both partners contribute to the team score.

The couple should never be negatively compared against each other.

Future days cannot be marked as completed.

Historical days can be edited.

The app should automatically calculate Day 1 through Day 100 based on the challenge start date.

All calculations should persist through Supabase.

Seed Data

Create realistic demo data for the first 10 days so the UI doesn't look empty during development.

Use fictional demo names such as:

Alex & Priya

Do not use real personal information.

Final Design Direction

Think of the product as a combination of:

Habit Tracker + Couple Challenge + Personal Finance Discipline + Learning Tracker

but keep the experience extremely simple.

The most important screen is Today.

The user should be able to open the app every morning and understand exactly what needs to be done within 5 seconds.

Prioritize usability over adding too many features.

Build the complete responsive application with polished UI, working interactions, Supabase data persistence, calculations, loading states, empty states, error states, and mobile responsiveness.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://together-100-days.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7680ffdd-0e11-4fd7-8830-67092699e21d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
