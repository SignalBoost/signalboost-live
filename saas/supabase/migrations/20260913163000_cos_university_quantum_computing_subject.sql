-- Add Quantum Computing as an explicit required COS University undergraduate subject.
-- This migration only widens the valid subject identity set. It creates no assessment,
-- grade, credential, enrollment, authority, or Production evidence.

alter table public.cos_university_assessments
  drop constraint if exists cos_university_assessments_subject_id_check;
alter table public.cos_university_assessments
  add constraint cos_university_assessments_subject_id_check check (
    subject_id is null or subject_id in (
      'computer_science','mathematics','statistics_data_science','physics_natural_sciences','quantum_computing','cybersecurity',
      'politics_government_international_relations','social_behavioral_sciences','economics_finance',
      'business_operations','law_regulation_governance','language_communication',
      'history_culture_philosophy_religion','reasoning_decision_science'
    )
  );

alter table public.cos_university_study_plans
  drop constraint if exists cos_university_study_plans_subject_id_check;
alter table public.cos_university_study_plans
  add constraint cos_university_study_plans_subject_id_check check (
    subject_id in (
      'computer_science','mathematics','statistics_data_science','physics_natural_sciences','quantum_computing','cybersecurity',
      'politics_government_international_relations','social_behavioral_sciences','economics_finance',
      'business_operations','law_regulation_governance','language_communication',
      'history_culture_philosophy_religion','reasoning_decision_science'
    )
  );

alter table public.cos_university_exam_runs
  drop constraint if exists cos_university_exam_runs_subject_id_check;
alter table public.cos_university_exam_runs
  add constraint cos_university_exam_runs_subject_id_check check (
    subject_id is null or subject_id in (
      'computer_science','mathematics','statistics_data_science','physics_natural_sciences','quantum_computing','cybersecurity',
      'politics_government_international_relations','social_behavioral_sciences','economics_finance',
      'business_operations','law_regulation_governance','language_communication',
      'history_culture_philosophy_religion','reasoning_decision_science'
    )
  );

alter table public.cos_university_a_range_runs
  drop constraint if exists cos_university_a_range_runs_subject_id_check;
alter table public.cos_university_a_range_runs
  add constraint cos_university_a_range_runs_subject_id_check check (
    subject_id in (
      'computer_science','mathematics','statistics_data_science','physics_natural_sciences','quantum_computing','cybersecurity',
      'politics_government_international_relations','social_behavioral_sciences','economics_finance',
      'business_operations','law_regulation_governance','language_communication',
      'history_culture_philosophy_religion','reasoning_decision_science'
    )
  );
