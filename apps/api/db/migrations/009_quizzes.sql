-- a quiz without a lecture covers the whole course
CREATE TABLE quizzes (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecture_id INTEGER,
    title TEXT NOT NULL CHECK (title <> ''),
    model TEXT NOT NULL,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, id),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE
);
CREATE INDEX quizzes_by_course ON quizzes(course_id, lecture_id);

-- sources snapshot where each question came from, so they survive re-indexing
CREATE TABLE quiz_questions (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    prompt TEXT NOT NULL CHECK (prompt <> ''),
    choices TEXT[] NOT NULL CHECK (cardinality(choices) BETWEEN 2 AND 6),
    correct_choice INTEGER NOT NULL CHECK (correct_choice >= 0 AND correct_choice < cardinality(choices)),
    explanation TEXT NOT NULL CHECK (explanation <> ''),
    sources JSONB NOT NULL DEFAULT '[]',
    UNIQUE (quiz_id, position),
    UNIQUE (quiz_id, id)
);

CREATE TABLE quiz_attempts (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0),
    total INTEGER NOT NULL CHECK (total > 0 AND score <= total),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (quiz_id, id)
);
CREATE INDEX quiz_attempts_by_user ON quiz_attempts(user_id, quiz_id);

-- composite keys keep every answer on a question from the attempt's own quiz
CREATE TABLE quiz_attempt_answers (
    attempt_id INTEGER NOT NULL,
    quiz_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    selected_choice INTEGER CHECK (selected_choice >= 0),
    PRIMARY KEY (attempt_id, question_id),
    FOREIGN KEY (quiz_id, attempt_id) REFERENCES quiz_attempts(quiz_id, id) ON DELETE CASCADE,
    FOREIGN KEY (quiz_id, question_id) REFERENCES quiz_questions(quiz_id, id) ON DELETE CASCADE
);
