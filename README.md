# Competency Training Tracker

## Tech Stack

- Next.js 16 (App Router) + React 25.1.0
- TypeScript 5 and ESLint for type safety and linting
- Tailwind CSS 4 with `@tailwindcss/postcss` for styling
- Drizzle ORM with PostgreSQL for data access
- Better Auth for authentication flows
- React Hook Form + Zod for forms and validation
- Lucide React icon set

## Prerequisites

- Node.js 25 or newer and npm 10+
- Local PostgreSQL instance 

## Fresh Install

1. Clone the repository and enter the project directory:
   ```bash
   git clone https://github.com/FoodStyles-Tech-Tools/training-tracker.git
   cd training-tracker
   ```
2. Copy the environment template and adjust values as needed:
   ```bash
   cp .env.example .env
   ```
3. Ensure PostgreSQL is running and create a `training_tracker` database (or update `DATABASE_URL` to point at your own database).
4. Install project dependencies:
   ```bash
   npm install
   ```
5. Apply the database schema using Drizzle:
   ```bash
   npm run db:push
   ```
6. (Optional) Seed development data once the schema is in place:
   ```bash
   npm run db:seed
   ```
7. Start the development server:
   ```bash
   npm run dev
   ```
8. Visit `http://localhost:3000` and sign in using development credentials from the seed (if enabled).

## Environment Variables

The `.env.example` file documents all required values:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Drizzle ORM. |
| `BETTER_AUTH_SECRET` | Secret key used by Better Auth. Generate a new base64 string for production. |
| `NEXT_PUBLIC_APP_URL` | Base URL that the client bundle uses for routing and API calls. |
| `NEXT_TELEMETRY_DISABLED` | Disable Next.js telemetry in development. |
| `BETTER_AUTH_TELEMETRY` | Opt out of Better Auth telemetry. |
| `ADMIN_SEED_EMAIL` | Optional email for the seeded admin user. |
| `ADMIN_SEED_PASSWORD` | Optional password for the seeded admin user. |

## Common Scripts

Run these through `npm run <script>`:

- `dev` – start the local development server on port 3000.
- `build` – create an optimized production build.
- `start` – run the production build locally.
- `lint` – lint the project with ESLint.
- `db:generate` – regenerate Drizzle schema types (after modifying `drizzle` migrations).
- `db:push` – sync the local database schema.
- `db:studio` – open the Drizzle Studio web UI.
- `db:seed` – populate the database with development fixtures.

## Database Notes

Drizzle migrations live under `drizzle/`. Whenever you make schema changes:

1. Update the schema definitions in `src/db` (or the relevant directory).
2. Generate SQL migrations with `npm run db:generate`.
3. Apply them using `npm run db:push` and verify in Drizzle Studio (`npm run db:studio`).

## Deployment

The app can be deployed to any platform that supports Node.js. Vercel is the default target for Next.js projects, but ensure environment variables and your PostgreSQL connection are configured for the target environment.
