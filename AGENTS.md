# Repository Guidelines

## Project Structure & Module Organization

GymLedger is a Next.js App Router project using TypeScript, Tailwind CSS, and Supabase. Route files live in `src/app`; authenticated app pages are grouped under `src/app/(app)`, while auth screens live under `src/app/(auth)`. Reusable UI components are in `src/components/ui`, app-level layout components are in `src/components/app`, and shared server utilities, auth helpers, permissions, and module metadata are in `src/lib`. Supabase schema work is kept in `supabase/migrations`, with local seed data in `supabase/seed.sql`.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the local Next.js development server.
- `npm run lint`: run ESLint with Next.js core web vitals and TypeScript rules.
- `npm run build`: create a production build and catch route/type integration issues.
- `npm run start`: serve the production build after `npm run build`.

Run `npm run lint` and `npm run build` before handing off changes.

## Coding Style & Naming Conventions

Use strict TypeScript and keep new code in `.ts` or `.tsx` files. Follow the existing two-space indentation, double-quoted imports, and semicolon style. Components and React files use PascalCase exports, while route folders and utility filenames use lowercase or kebab-case patterns such as `login-form.tsx` and `start-shift-form.tsx`. Prefer the `@/*` path alias for imports from `src`. Keep server-only Supabase/auth logic in `src/lib` or server actions, not client components.

## Testing Guidelines

No dedicated test runner is configured yet. For now, treat `npm run lint` and `npm run build` as required verification. When adding tests later, colocate focused tests near the feature or place broader integration tests under a top-level `tests` directory, and use descriptive names such as `members-create.test.ts`.

## Commit & Pull Request Guidelines

This checkout does not include Git history, so use concise imperative commit messages such as `Add member edit form` or `Fix shift start validation`. Pull requests should include a short summary, verification commands run, linked issue or task reference when available, and screenshots for visible UI changes. Call out Supabase migration changes explicitly, including any seed data updates.

## Security & Configuration Tips

Do not commit real secrets or local environment files. Keep Supabase credentials in `.env.local` and document any new required variables in the README. Review row-level security and permission helper changes together, especially files under `src/lib/auth` and `supabase/migrations`.
