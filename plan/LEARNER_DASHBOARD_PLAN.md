# Learner Dashboard Module - Implementation Plan

## Overview
Create a new Learner Dashboard module that allows the current logged-in user to browse competencies, view training levels, apply for training, submit projects, and track their progress. This module will be based on the `learner_dashboard.html` prototype and use the database schema defined in `dbdiagram_schema.md`.

**Important**: The dashboard displays data specific to the currently logged-in user. All training requests, project submissions, validations, and homework are filtered by the current user's ID.

## Route Structure
```
/learner-dashboard
  ├── layout.tsx          # Learner layout with navigation
  ├── page.tsx             # Main learner dashboard page (shows current logged-in user's data)
  └── learner-shell.tsx   # Shell component for navigation
```

## Key Features

### 1. Competency Selection
- **Dropdown selector** to choose from published competencies
- Display competency name and description
- Show all available competencies from `competencies` table (status = 1)

### 2. Level Tabs (Basic, Competent, Advanced)
- Three tabs for each competency level
- Display level-specific information:
  - Training Plan Document (link)
  - What team member should know
  - Eligibility criteria
  - Verification requirements
- **Relevant Links**: Displayed for ALL levels (same content for Basic, Competent, Advanced)
  - Relevant Links belong to the competency, not to individual levels
  - Stored in `competencies.relevant_links` field
  - Same relevant links displayed regardless of which level tab is active

### 3. Training Request Management
- **Apply Button**: Allow learners to apply for a competency level
- **Training Request Display**: Show existing training requests with:
  - Applied date
  - Training status (In queue, In Progress, Training Complete, etc.)
  - Training Request ID (TRxx)
- **Status Tracking**: Based on `training_request` table status field

### 4. Project Submission (All Levels: Basic, Competent, Advanced)
- **Submit Project Interface**: Rich text editor for project details
- **Available for all competency levels** (Basic, Competent, Advanced)
- **Project States**:
  - Initial (editable)
  - Submitted (read-only, pending approval)
  - Approved (read-only, green badge)
  - Rejected (editable, can resubmit)
- **Status Display**: Show submission date, status, approver name, approval date
- Uses `validation_project_approval` table
- Filtered by current logged-in user's ID

### 5. Validation Interface (All Levels: Basic, Competent, Advanced)
- **Validation Status Display**:
  - Pending Validation
  - Validation Scheduled (with date, validators)
  - Pass (with finalized date and validator)
  - Fail (with finalized date and validator)
- **Available for all competency levels** (Basic, Competent, Advanced)
- **Request Project Button**: For requesting project assignment
- Uses `validation_schedule_request` table
- Filtered by current logged-in user's ID

### 6. Requirements Checking
- **Requirements Section**: Display prerequisite competencies needed
- Check if learner has completed required competency levels
- Show completion status with checkmarks
- Disable Apply button if requirements not met
- Uses `competency_requirements` table

### 7. Homework Submission (All Levels: Basic, Competent, Advanced)
- **Submit Homework Button**: Opens modal with homework items
- **Available for all competency levels** (Basic, Competent, Advanced)
- Multiple homework submissions per session
- Track completion status
- Uses `training_batch_homework_sessions` table
- Filtered by current logged-in user's ID

## Database Tables Used

### Primary Tables
- `competencies` - List of all competencies
  - Contains `relevant_links` field (shared across all levels for the competency)
- `competency_levels` - Levels (Basic, Competent, Advanced) for each competency
  - Does NOT contain relevant_links (links are competency-level, not level-specific)
- `competency_requirements` - Prerequisites for competency levels
- `training_request` - Training applications and their status (filtered by learner_user_id)
- `validation_project_approval` - Project submissions for ALL levels (filtered by learner_user_id)
- `validation_schedule_request` - Validation requests for ALL levels (filtered by learner_user_id)
- `training_batch_homework_sessions` - Homework submissions for ALL levels (filtered by learner_user_id)

### Related Tables
- `users` - Learner information
- `training_batch` - Training batches
- `training_batch_learners` - Learner-batch associations

## Component Structure

### Layout Component (`/learner-dashboard/layout.tsx`)
- Similar to admin layout
- Get current logged-in user from session
- Check user permissions (if needed)
- Provide navigation items
- Use LearnerShell component
- Pass current user ID to child components

### Main Page Component (`/learner-dashboard/page.tsx`)
- Get current logged-in user from session
- Filter all data by current user's ID
- Competency selector dropdown
- Level tabs (Basic, Competent, Advanced)
- Dynamic content based on selected competency and level
- **Relevant Links section**: Displayed consistently for all levels (from competency, not level-specific)
- Training request display (user-specific)
- Project submission interface (for ALL levels, user-specific)
- Validation interface (for ALL levels, user-specific)
- Homework submission (for ALL levels, user-specific)
- Requirements section

### Shell Component (`learner-shell.tsx`)
- Navigation sidebar
- Header with user info
- Mobile navigation
- Similar to AdminShell but with learner-specific navigation

## API Endpoints Needed

### GET `/api/learner-dashboard/competencies`
- Get all published competencies with their levels
- Include `relevant_links` from competency (shared across all levels)
- Include requirement information
- Include user's progress for each competency level

### GET `/api/learner-dashboard/training-requests`
- Get training requests for current logged-in user
- Filter by competency and level
- Automatically filter by session user ID

### POST `/api/learner-dashboard/training-requests`
- Create new training request for current logged-in user
- Automatically set learner_user_id from session
- Generate TR ID using custom_numbering

### GET `/api/learner-dashboard/project-approvals`
- Get project approvals for current logged-in user
- Filter by competency and level
- Available for ALL levels (Basic, Competent, Advanced)
- Automatically filter by learner_user_id

### POST `/api/learner-dashboard/project-approvals`
- Submit new project for current logged-in user
- Available for ALL levels (Basic, Competent, Advanced)
- Automatically set learner_user_id from session
- Generate VPA ID using custom_numbering

### GET `/api/learner-dashboard/validation-requests`
- Get validation requests for current logged-in user
- Filter by competency and level
- Available for ALL levels (Basic, Competent, Advanced)
- Automatically filter by learner_user_id

### POST `/api/learner-dashboard/validation-requests`
- Request validation for current logged-in user
- Available for ALL levels (Basic, Competent, Advanced)
- Automatically set learner_user_id from session
- Generate VSR ID using custom_numbering

### GET `/api/learner-dashboard/homework`
- Get homework submissions for current logged-in user
- Filter by competency, level, and training batch
- Available for ALL levels (Basic, Competent, Advanced)
- Automatically filter by learner_user_id

### POST `/api/learner-dashboard/homework`
- Submit homework for current logged-in user
- Available for ALL levels (Basic, Competent, Advanced)
- Automatically set learner_user_id from session

### GET `/api/learner-dashboard/requirements/:competencyId/:levelId`
- Get requirements for a specific competency level
- Check completion status for current logged-in user
- Automatically filter by session user ID

## UI Components Needed

### CompetencySelector
- Dropdown to select competency
- Shows competency name

### LevelTabs
- Three tabs: Basic, Competent, Advanced
- Active state styling
- Content switching

### TrainingRequestCard
- Display training request information
- Status badge
- Applied date
- Action buttons if applicable

### ProjectSubmissionCard
- Rich text editor (Quill or similar)
- Status display
- Submit/Resubmit buttons
- Read-only mode for approved/submitted

### ValidationCard
- Status display
- Validator information
- Scheduled date
- Request Project button

### RequirementsCard
- List of required competencies
- Completion status indicators
- Warning message if not met

### RelevantLinksCard
- Display relevant links from competency
- Same content displayed for all levels (Basic, Competent, Advanced)
- Rich text field from `competencies.relevant_links`
- Positioned consistently regardless of active level tab

### HomeworkModal
- Modal with multiple homework inputs
- Submit buttons for each homework
- Completion status

## State Management

### Client-Side State
- Selected competency ID
- Selected level (basic, competent, advanced)
- Training request data
- Project approval data
- Validation request data
- Requirements data

### Server-Side Data
- Current logged-in user (from session)
- Competencies list (including `relevant_links` field - shared across all levels)
- Competency levels (Basic, Competent, Advanced) - does NOT include relevant_links
- Current user's training requests (filtered by learner_user_id)
- Current user's project approvals (filtered by learner_user_id, ALL levels)
- Current user's validation requests (filtered by learner_user_id, ALL levels)
- Current user's homework submissions (filtered by learner_user_id, ALL levels)
- Current user's completed competency levels (for requirements checking)

## Implementation Steps

1. **Create route structure** (`/learner-dashboard` directory)
2. **Create LearnerShell component** (similar to AdminShell)
3. **Create layout component** with navigation and session handling
4. **Create main page component** with competency selector
5. **Implement user-specific data fetching** (filter by current user ID)
6. **Implement level tabs** with content switching
7. **Add Relevant Links section** (from competency, displayed consistently for all levels)
8. **Add training request display** and application (user-specific)
9. **Add project submission interface** for ALL levels (Basic, Competent, Advanced)
10. **Add validation interface** for ALL levels (Basic, Competent, Advanced)
11. **Add homework submission** modal for ALL levels (Basic, Competent, Advanced)
12. **Add requirements checking** and display
13. **Create API endpoints** for data fetching and mutations (with user filtering)
14. **Ensure Relevant Links are fetched from competency table** (not from levels)
15. **Add error handling** and loading states
16. **Add form validation** and user feedback
17. **Ensure all data is filtered by current logged-in user**

## Styling
- Use existing Tailwind CSS classes
- Match the dark theme (slate-950, slate-900, etc.)
- Use prototype HTML as reference for styling
- Maintain consistency with admin dashboard

## Testing Considerations
- Test competency selection
- Test level switching
- Test training request creation
- Test project submission flow
- Test validation request flow
- Test requirements checking
- Test homework submission
- Test error states
- Test loading states

