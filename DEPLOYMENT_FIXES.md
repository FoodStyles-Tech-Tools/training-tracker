# Vercel Deployment Fixes

## SSL Certificate Issue ✅ FIXED

### Problem
Database connection failed during Vercel build with error:
```
Error: self-signed certificate in certificate chain
```

### Root Cause
The PostgreSQL database uses a self-signed SSL certificate. When `sslmode=require` is in the connection string, the `pg` library parses it and ignores the explicit `ssl` configuration in the Pool options.

### Solution
**Commit:** `faf1a18` - Fix SSL certificate issue by removing sslmode from connection string

Modified files:
- `src/scripts/migrate.ts`
- `src/db/index.ts`

Changes:
1. Strip `?sslmode=require` from connection string when SSL is needed
2. Set explicit `ssl: { rejectUnauthorized: false }` in Pool configuration
3. Added debug logging to verify SSL configuration

### Result
```
✓ Migrations completed successfully!
```

---

## TypeScript Zod Schema Errors ✅ FIXED

### Problem
Multiple TypeScript compilation errors during Vercel build:
```
Type 'undefined' is not assignable to type 'X'
```

### Root Cause
Using `.optional().default(value)` in Zod schemas causes type inference issues with `zodResolver` from `@hookform/resolvers/zod`. The TypeScript compiler infers the type as potentially `undefined` even when a default is provided.

### Solution
**Commits:**
- `1759c0f` - Fix status field in competency-form.tsx
- `601bdd6` - Fix requirementLevelIds in competency-form.tsx
- `613317b` - Fix all remaining Zod schemas across codebase

Modified files:
1. `src/app/(dashboard)/admin/competencies/competency-form.tsx`
   - Fixed: `status` field (removed `.default()` from enum)
   - Fixed: `requirementLevelIds` field (removed `.optional()`)

2. `src/app/(dashboard)/admin/competencies/actions.ts`
   - Fixed: `status` field (removed `.default()` from enum)
   - Fixed: `requirementLevelIds` field (removed `.optional()`)

3. `src/app/(dashboard)/admin/training-batches/training-batch-form.tsx`
   - Fixed: `learnerIds` field (removed `.optional()`)
   - Fixed: `sessionDates` field (removed `.optional()`)

4. `src/app/(dashboard)/admin/training-batches/actions.ts`
   - Fixed: `learnerIds` field (removed `.optional()`)
   - Fixed: `sessionDates` field (removed `.optional()`)

### Pattern Fixed
**Before:**
```typescript
status: z.enum(["draft", "published"]).default("draft"),
learnerIds: z.array(z.string()).optional().default([]),
```

**After:**
```typescript
status: z.enum(["draft", "published"]),
learnerIds: z.array(z.string()).default([]),
```

### Why This Works
- The `.default()` method is sufficient on its own
- Default values are provided in `defaultValues` prop of `useForm()`
- Removing `.optional()` prevents TypeScript from inferring `undefined` as possible type
- For enum fields with `.default()`, removing the `.default()` is better since defaultValues handles it

---

## Environment Variable Configuration

### Files Created
1. **`.env.example`** - Template for all required environment variables
2. **`VERCEL_DEPLOYMENT.md`** - Deployment guide and troubleshooting
3. **`README.md`** - Updated with environment variable strategy

### Environment Variable Strategy

**Local Development:**
- Use `.env.local` (gitignored)
- Next.js loads it automatically

**Vercel Preview:**
- Set in Vercel Dashboard → Environment Variables → Preview
- Used for branch deployments and pull requests

**Vercel Production:**
- Set in Vercel Dashboard → Environment Variables → Production
- Used for production domain

### Required Variables
- `DATABASE_URL` - PostgreSQL connection string (with `?sslmode=require`)
- `BETTER_AUTH_SECRET` - Min 32 characters
- `NEXT_PUBLIC_APP_URL` - Deployment URL
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret

---

## Build Status

### Before Fixes
❌ Migration failed: SSL certificate error
❌ TypeScript compilation failed

### After Fixes
✅ SSL Configuration working
✅ Migrations completed successfully
✅ TypeScript compilation clean
✅ Next.js build successful
✅ Ready for production deployment

---

## Commands Used

```bash
# Commit SSL fix
git add src/scripts/migrate.ts src/db/index.ts
git commit -m "Fix SSL certificate issue by removing sslmode from connection string"

# Commit TypeScript fixes
git add src/app/(dashboard)/admin/competencies/competency-form.tsx
git commit -m "Fix TypeScript error in competency form"

git add src/app/(dashboard)/admin/training-batches/*
git add src/app/(dashboard)/admin/competencies/actions.ts
git commit -m "Fix all Zod schema type errors"

# Deploy
git push
```

---

## Lessons Learned

1. **SSL with pg library:** Connection string SSL params override Pool config. Strip them and use explicit Pool configuration.

2. **Zod + zodResolver:** Avoid `.optional().default()` pattern. Use just `.default()` or just `.optional()`.

3. **Enum defaults:** When using enum fields with react-hook-form, provide defaults via `defaultValues` instead of Zod schema.

4. **Debug logging:** Add conditional debug logging (only in Vercel) to diagnose deployment issues.

---

## Files Modified Summary

**Database/SSL (2 files):**
- src/scripts/migrate.ts
- src/db/index.ts

**Zod Schemas (4 files):**
- src/app/(dashboard)/admin/competencies/competency-form.tsx
- src/app/(dashboard)/admin/competencies/actions.ts
- src/app/(dashboard)/admin/training-batches/training-batch-form.tsx
- src/app/(dashboard)/admin/training-batches/actions.ts

**Documentation (3 files):**
- .env.example (created)
- VERCEL_DEPLOYMENT.md (created)
- README.md (updated)

