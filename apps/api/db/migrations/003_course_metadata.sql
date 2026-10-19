ALTER TABLE courses
    ADD COLUMN code TEXT UNIQUE,
    ADD COLUMN description TEXT;
