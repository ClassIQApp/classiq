CREATE TABLE course_invitations (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_pending_invitation_per_course_user ON course_invitations(course_id, user_id) WHERE status = 'pending';
CREATE INDEX course_invitations_by_user ON course_invitations(user_id);
