Enum action {
  add
  edit
  delete
}

Enum module_name {
  roles
  users
  activity_log
}

Table roles_list {
  id uuid [pk, default: `gen_random_uuid()`]
  role_name text [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (role_name) [unique]
  }
}

Table roles_permission {
  id uuid [pk, default: `gen_random_uuid()`]
  role_id uuid [not null]
  module module_name [not null]
  can_list boolean [not null, default: false]
  can_add boolean [not null, default: false]
  can_edit boolean [not null, default: false]
  can_delete boolean [not null, default: false]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (role_id, module) [unique]
  }
}

Table users {
  id uuid [pk, default: `gen_random_uuid()`]
  name text [not null]
  email text [not null]
  email_verified boolean [not null, default: false]
  image text
  discord_id text
  is_active boolean [not null, default: true] // TODO: Not yet implemented in actual schema
  role_id uuid
  created_date timestamptz [not null, default: `now()`]
  updated_date timestamptz [not null, default: `now()`]

  Indexes {
    (email) [unique]
    (role_id)
  }
}

Table auth_accounts {
  id uuid [pk, default: `gen_random_uuid()`]
  user_id uuid [not null]
  provider_id text [not null]
  account_id text [not null]
  password text
  access_token text
  refresh_token text
  id_token text
  scope text
  access_token_expires_at timestamptz
  refresh_token_expires_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (user_id)
    (provider_id, account_id) [unique]
    (user_id, provider_id) [unique]
  }
}

Table auth_sessions {
  id text [pk, default: `gen_random_uuid()::text`]
  user_id uuid [not null]
  token text [not null]
  ip_address text
  user_agent text
  expires_at timestamptz [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (user_id)
    (token) [unique]
  }
}

Table auth_verification_tokens {
  id uuid [pk, default: `gen_random_uuid()`]
  identifier text [not null]
  token text [not null]
  expires_at timestamptz [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (identifier, token) [unique]
  }
}

Table activity_log {
  id uuid [pk, default: `gen_random_uuid()`]
  user_id uuid [not null]
  module module_name [not null]
  action action [not null]
  timestamp timestamptz [not null, default: `now()`]
  data text

  Indexes {
    (user_id)
    (user_id, timestamp)
    (module, action, timestamp)
  }
}

Table competencies {
  id uuid [pk, default: `gen_random_uuid()`]
  name text [not null]
  status int [not null, default: 0] // 0=draft, 1=published
  relevant_links text // Rich text field for relevant links and resources
  is_deleted boolean [not null, default: false]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}

Table competency_levels {
  id uuid [pk, default: `gen_random_uuid()`]
  competency_id uuid [not null]
  name text [not null]
  training_plan_document text [not null]
  team_knowledge text [not null]
  eligibility_criteria text [not null]
  verification text [not null]
  is_deleted boolean [not null, default: false]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (competency_id, name) [unique]
  }
}

Table competencies_trainer {
  competency_id uuid [not null]
  trainer_user_id uuid [not null]

  Indexes {
    (competency_id, trainer_user_id) [pk]
    (trainer_user_id)
  }
}

Table competency_requirements {
  id uuid [pk, default: `gen_random_uuid()`]
  competency_id uuid [not null] // The competency being defined
  required_competency_level_id uuid [not null] // The required competency level (references competency_levels.id)
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (competency_id, required_competency_level_id) [unique]
    (competency_id)
    (required_competency_level_id)
  }
}

Table training_batch {
  id uuid [pk, default: `gen_random_uuid()`]
  competency_level_id uuid [not null]
  trainer_user_id uuid [not null]
  batch_name text [not null]
  session1_date date
  session2_date date
  session3_date date
  session4_date date
  session5_date date
  session6_date date
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (competency_level_id)
    (trainer_user_id)
  }
}

Table training_batch_learners {
  training_batch_id uuid [not null]
  learner_user_id uuid [not null]
  training_request_id uuid [not null]

  Indexes {
    (training_batch_id, learner_user_id) [pk]
    (training_request_id)
    (learner_user_id)
  }
}

Table training_batch_attendance {
  training_batch_id uuid [not null]
  learner_user_id uuid [not null]
  session1_attended boolean [not null, default: false]
  session2_attended boolean [not null, default: false]
  session3_attended boolean [not null, default: false]
  session4_attended boolean [not null, default: false]
  session5_attended boolean [not null, default: false]
  session6_attended boolean [not null, default: false]
  homework1_date date
  homework2_date date
  homework3_date date
  homework4_date date
  homework5_date date
  homework6_date date

  Indexes {
    (training_batch_id, learner_user_id) [pk]
    (learner_user_id)
  }
}
  
// NOTE: To generate next number atomically and prevent race conditions with concurrent requests,
// use PostgreSQL's atomic UPDATE with RETURNING:
//   UPDATE custom_numbering 
//   SET running_number = running_number + 1 
//   WHERE module = 'tr' 
//   RETURNING running_number;
// This ensures each request gets a unique number even with 100+ concurrent requests.
// PostgreSQL automatically queues and serializes the updates at the row level.
// on the web app, use returner running_number - 1
Table custom_numbering {
  module text [pk] // one row per module
  running_number int [not null]

}

Table training_request {
  id uuid [pk, default: `gen_random_uuid()`]
  tr_id text [not null] // human-readable, e.g., TRxx
  requested_date date [not null]
  learner_user_id uuid [not null]
  competency_level_id uuid [not null]
  training_batch_id uuid
  status int [not null, default: 0] // 0=Not Started,1=In Queue,2=No batch match,3=In Progress,4=Training Complete,5=On Hold,6=Drop Off
  on_hold_by int // 0=Learner, 1=Trainer
  on_hold_dropoff_reason text
  is_blocked boolean [not null, default: false]
  blocked_reason text
  expected_unblocked_date date
  notes text
  response_due date
  assigned_to uuid
  response_date date
  definite_answer bool
  follow_up_date date
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Indexes {
    (tr_id) [unique]
    (learner_user_id)
    (competency_level_id)
    (training_batch_id)
    (assigned_to)
  }
}

Table validation_project_approval {
  id uuid [pk, default: `gen_random_uuid()`]
  vpa_id text [not null] // human-readable, e.g., VPAxx
  tr_id text
  requested_date date [not null]
  learner_user_id uuid [not null]
  competency_level_id uuid [not null]
  project_details text
  status int [not null, default: 0] // 0 = Pending Validation Project Approval, 1 = Approved, 2 = Rejected, 3 = Resubmit for Re-validation
  assigned_to uuid 
  response_due date // if status Pending Validation Project Approval, fill +1 from requested date
  response_date date
  definite_answer bool
  no_follow_up_date date
  follow_up_date date
  updated_at timestamptz [not null, default: `now()`]
  created_at timestamptz [not null, default: `now()`]

  Indexes {
    (vpa_id) [unique]
    (learner_user_id)
    (competency_level_id)
    (assigned_to)
  }
}

Table validation_project_approval_log {
  id uuid [pk, default: `gen_random_uuid()`]
  vpa_id text [not null]
  status int
  project_details_text text 
  updated_by uuid
  created_at timestamptz [not null, default: `now()`]

  Indexes {
    (vpa_id)
    (updated_by)
  }
}

Table validation_schedule_request {
  id uuid [pk, default: `gen_random_uuid()`]
  vsr_id text [not null] // human-readable, e.g., VSRxx
  tr_id text
  requested_date date [not null]
  learner_user_id uuid [not null]
  competency_level_id uuid [not null]
  description text
  status int [not null, default: 0] // 0 = Pending Validation , 1 = Pending Re-validation, 2 = Validation Only, 3 = Validation Scheduled, 4 = Fail, 5 = Pass
  response_due date // if status Pending, fill +1 from requested date
  response_date date
  definite_answer bool
  no_follow_up_date date
  follow_up_date date
  scheduled_date date
  validator_ops uuid
  validator_trainer uuid
  updated_at timestamptz [not null, default: `now()`]
  created_at timestamptz [not null, default: `now()`]

  Indexes {
    (vsr_id) [unique]
    (learner_user_id)
    (competency_level_id)
    (validator_ops)
    (validator_trainer)
  }
}

Table validation_schedule_request_log {
  id uuid [pk, default: `gen_random_uuid()`]
  vsr_id text [not null]
  status int
  updated_by uuid
  created_at timestamptz [not null, default: `now()`]

  Indexes {
    (vsr_id)
    (updated_by)
  }
}

/* relationships */

Ref: roles_permission.role_id > roles_list.id [delete: cascade]
Ref: users.role_id > roles_list.id [delete: set null]

Ref: auth_accounts.user_id > users.id [delete: cascade]
Ref: auth_sessions.user_id > users.id [delete: cascade]

Ref: activity_log.user_id > users.id [delete: cascade]

Ref: competency_levels.competency_id > competencies.id [delete: cascade]
Ref: competencies_trainer.competency_id > competencies.id [delete: cascade]
Ref: competencies_trainer.trainer_user_id > users.id [delete: cascade]
Ref: competency_requirements.competency_id > competencies.id [delete: cascade]
Ref: competency_requirements.required_competency_level_id > competency_levels.id [delete: cascade]

Ref: training_batch.competency_level_id > competency_levels.id [delete: cascade]
Ref: training_batch.trainer_user_id > users.id [delete: cascade]

Ref: training_batch_learners.training_batch_id > training_batch.id [delete: cascade]
Ref: training_batch_learners.learner_user_id > users.id [delete: cascade]
Ref: training_batch_learners.training_request_id > training_request.id [delete: cascade]

Ref: training_batch_attendance.training_batch_id > training_batch.id [delete: cascade]
Ref: training_batch_attendance.learner_user_id > users.id [delete: cascade]

Ref: training_request.learner_user_id > users.id [delete: cascade]
Ref: training_request.competency_level_id > competency_levels.id [delete: cascade]
Ref: training_request.training_batch_id > training_batch.id [delete: set null]


// Foreign key relationships using text IDs (human-readable IDs from custom_numbering table)
Ref: validation_project_approval.vpa_id > validation_project_approval_log.vpa_id [delete: cascade]
Ref: validation_schedule_request.vsr_id > validation_schedule_request_log.vsr_id [delete: cascade]

// Foreign key relationships using UUIDs
Ref: validation_project_approval.learner_user_id > users.id [delete: cascade]
Ref: validation_schedule_request.learner_user_id > users.id [delete: cascade]
Ref: validation_project_approval.competency_level_id > competency_levels.id [delete: cascade]
Ref: validation_schedule_request.competency_level_id > competency_levels.id [delete: cascade]
Ref: validation_project_approval.assigned_to > users.id [delete: set null]
Ref: validation_schedule_request.validator_ops > users.id [delete: set null]
Ref: validation_schedule_request.validator_trainer > users.id [delete: set null]
Ref: training_request.assigned_to > users.id [delete: set null]
Ref: validation_project_approval_log.updated_by > users.id [delete: set null]
Ref: validation_schedule_request_log.updated_by > users.id [delete: set null]

// Foreign key relationships using text IDs (human-readable IDs)
Ref: validation_schedule_request.tr_id > training_request.tr_id [delete: set null]
Ref: validation_project_approval.tr_id > training_request.tr_id [delete: set null]