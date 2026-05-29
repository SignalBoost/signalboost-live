-- SignalBoost onboarding profile, analytics, error logging, and feedback schema.
-- Supports the five-step onboarding flow, Apprentice Workshop adaptation,
-- admin analytics dashboard, and post-deployment monitoring plan.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS user_profile (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) CHECK (role IN ('developer','non_developer')),
    it_level VARCHAR(20) CHECK (it_level IN ('beginner','intermediate','advanced')),
    tone_preference VARCHAR(20) CHECK (tone_preference IN ('friendly','professional','playful')) DEFAULT 'friendly',
    consent_ai_training BOOLEAN DEFAULT FALSE,
    consent_timestamp TIMESTAMPTZ,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_analytics (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profile(user_id) ON DELETE SET NULL,
    step_name VARCHAR(50),
    action VARCHAR(50),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    device_type VARCHAR(20) CHECK (device_type IN ('mobile','desktop','tablet')),
    browser VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS error_logs (
    error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profile(user_id) ON DELETE SET NULL,
    error_type VARCHAR(50),
    error_message TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    device_type VARCHAR(20) CHECK (device_type IN ('mobile','desktop','tablet'))
);

CREATE TABLE IF NOT EXISTS feedback (
    feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profile(user_id) ON DELETE CASCADE,
    response VARCHAR(10) CHECK (response IN ('yes','no')),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profile_onboarding_completed ON user_profile(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_user_profile_it_level ON user_profile(it_level);
CREATE INDEX IF NOT EXISTS idx_user_profile_tone_preference ON user_profile(tone_preference);
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_user_id ON onboarding_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_step_action ON onboarding_analytics(step_name, action);
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_timestamp ON onboarding_analytics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);

CREATE OR REPLACE FUNCTION set_user_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    IF NEW.consent_ai_training IS TRUE AND (TG_OP = 'INSERT' OR OLD.consent_ai_training IS DISTINCT FROM NEW.consent_ai_training OR NEW.consent_timestamp IS NULL) THEN
        NEW.consent_timestamp = CURRENT_TIMESTAMP;
    END IF;
    IF NEW.onboarding_completed IS TRUE AND (TG_OP = 'INSERT' OR OLD.onboarding_completed IS DISTINCT FROM NEW.onboarding_completed OR NEW.onboarding_completed_at IS NULL) THEN
        NEW.onboarding_completed_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profile_updated_at ON user_profile;
CREATE TRIGGER trg_user_profile_updated_at
BEFORE INSERT OR UPDATE ON user_profile
FOR EACH ROW
EXECUTE FUNCTION set_user_profile_updated_at();

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own onboarding profile" ON user_profile;
CREATE POLICY "Users can read own onboarding profile"
ON user_profile FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own onboarding profile" ON user_profile;
CREATE POLICY "Users can upsert own onboarding profile"
ON user_profile FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own onboarding profile" ON user_profile;
CREATE POLICY "Users can update own onboarding profile"
ON user_profile FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own onboarding analytics" ON onboarding_analytics;
CREATE POLICY "Users can insert own onboarding analytics"
ON onboarding_analytics FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own onboarding analytics" ON onboarding_analytics;
CREATE POLICY "Users can read own onboarding analytics"
ON onboarding_analytics FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own error logs" ON error_logs;
CREATE POLICY "Users can insert own error logs"
ON error_logs FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own error logs" ON error_logs;
CREATE POLICY "Users can read own error logs"
ON error_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own feedback" ON feedback;
CREATE POLICY "Users can insert own feedback"
ON feedback FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own feedback" ON feedback;
CREATE POLICY "Users can read own feedback"
ON feedback FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_signalboost_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.team_members
        WHERE (owner_id = auth.uid() OR member_id = auth.uid())
          AND (status = 'active' OR owner_id = auth.uid())
          AND (role IN ('owner','admin') OR owner_id = auth.uid())
    );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Admins can read all onboarding profiles" ON user_profile;
CREATE POLICY "Admins can read all onboarding profiles"
ON user_profile FOR SELECT
TO authenticated
USING (public.is_signalboost_admin());

DROP POLICY IF EXISTS "Admins can read all onboarding analytics" ON onboarding_analytics;
CREATE POLICY "Admins can read all onboarding analytics"
ON onboarding_analytics FOR SELECT
TO authenticated
USING (public.is_signalboost_admin());

DROP POLICY IF EXISTS "Admins can read all error logs" ON error_logs;
CREATE POLICY "Admins can read all error logs"
ON error_logs FOR SELECT
TO authenticated
USING (public.is_signalboost_admin());

DROP POLICY IF EXISTS "Admins can read all feedback" ON feedback;
CREATE POLICY "Admins can read all feedback"
ON feedback FOR SELECT
TO authenticated
USING (public.is_signalboost_admin());
