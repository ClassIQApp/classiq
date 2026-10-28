import { courseRoleSchema, type CourseRole } from "../course-access/model.ts";
import type { CourseInvitationRepository } from "./course-invitation-repository.ts";
import { CourseInvitationError } from "./errors.ts";
import type { CourseInvitation, CourseInvitationAcceptance, CourseInvitationDraft, CourseInvitationStatus } from "./model.ts";
import { DatabaseError, type Pool, type PoolClient } from "pg";

interface InvitationRow {
    id: number;
    course_id: number;
    course_name: string;
    email: string;
    status: string;
    created_at: Date;
}

interface MembershipRow {
    course_id: number;
    role: string;
}

const pending: CourseInvitationStatus = "pending";
const accepted: CourseInvitationStatus = "accepted";

const invitationSelection = `
    invitations.id,
    invitations.course_id,
    courses.name AS course_name,
    users.email,
    invitations.status,
    invitations.created_at
`;

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const postgresErrorCodes = {
    invalidTextRepresentation: "22P02",
    numericValueOutOfRange: "22003",
    uniqueViolation: "23505",
} as const;

export class PostgresCourseInvitationFacade implements CourseInvitationRepository {
    private readonly client: Pool;

    constructor(client: typeof this.client) {
        this.client = client;
    }

    async findAccountId(email: string): Promise<string | undefined> {
        const request = {
            text: "SELECT id FROM users WHERE email = $1",
            values: [email],
        };

        const [account] = await this.query<{ id: number }>(this.client, request);

        return account ? String(account.id) : undefined;
    }

    async create(draft: CourseInvitationDraft): Promise<CourseInvitation> {
        const request = {
            text: `
                WITH invitations AS (
                    INSERT INTO course_invitations (course_id, user_id, invited_by, status)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                )
                SELECT ${invitationSelection}
                FROM invitations
                JOIN courses ON courses.id = invitations.course_id
                JOIN users ON users.id = invitations.user_id
            `,
            values: [draft.courseId, draft.recipientId, draft.invitedBy, pending],
        };

        const [invitation] = await this.query<InvitationRow>(this.client, request);
        if (!invitation) {
            throw new CourseInvitationError("provider_error");
        }

        return this.convertInvitation(invitation);
    }

    async listPending(userId: string): Promise<CourseInvitation[]> {
        const request = {
            text: `
                SELECT ${invitationSelection}
                FROM course_invitations invitations
                JOIN courses ON courses.id = invitations.course_id
                JOIN users ON users.id = invitations.user_id
                WHERE invitations.user_id = $1
                    AND invitations.status = $2
                ORDER BY invitations.created_at DESC, invitations.id DESC
            `,
            values: [userId, pending],
        };

        const invitations = await this.query<InvitationRow>(this.client, request);

        return invitations.map((invitation) => this.convertInvitation(invitation));
    }

    async accept(invitationId: string, userId: string, role: CourseRole): Promise<CourseInvitationAcceptance | undefined> {
        const transition = {
            text: `
                UPDATE course_invitations
                SET status = $3, accepted_at = now()
                WHERE id = $1
                    AND user_id = $2
                    AND status = $4
                RETURNING course_id
            `,
            values: [invitationId, userId, accepted, pending],
        };
        const membership = {
            text: `
                INSERT INTO course_memberships (course_id, user_id, role)
                VALUES ($1, $2, $3)
                ON CONFLICT (course_id, user_id) DO NOTHING
            `,
        };
        const acceptance = {
            text: `
                SELECT memberships.course_id, memberships.role
                FROM course_invitations invitations
                JOIN course_memberships memberships
                    ON memberships.course_id = invitations.course_id
                    AND memberships.user_id = invitations.user_id
                WHERE invitations.id = $1
                    AND invitations.user_id = $2
                    AND invitations.status = $3
            `,
            values: [invitationId, userId, accepted],
        };

        const client = await this.connect();

        try {
            await client.query("BEGIN");

            const [invitation] = await this.query<{ course_id: number }>(client, transition);
            if (invitation) {
                await this.query(client, { ...membership, values: [invitation.course_id, userId, role] });
            }

            const [current] = await this.query<MembershipRow>(client, acceptance);

            await client.query("COMMIT");

            if (!current) {
                return undefined;
            }

            const currentRole = courseRoleSchema.safeParse(current.role);

            if (!currentRole.success) {
                throw new CourseInvitationError("provider_error");
            }

            return { courseId: String(current.course_id), role: currentRole.data };
        } catch (error) {
            await client.query("ROLLBACK");

            throw error;
        } finally {
            client.release();
        }
    }

    private async connect(): Promise<PoolClient> {
        try {
            return await this.client.connect();
        } catch (error) {
            throw this.convertError(error);
        }
    }

    private async query<Row extends object>(client: Pool | PoolClient, request: { text: string; values: unknown[] }): Promise<Row[]> {
        try {
            const response = await client.query<Row>(request);

            return response.rows;
        } catch (error) {
            throw this.convertError(error);
        }
    }

    private convertInvitation(row: InvitationRow): CourseInvitation {
        return {
            id: String(row.id),
            courseId: String(row.course_id),
            courseName: row.course_name,
            email: row.email,
            status: this.convertStatus(row.status),
            createdAt: row.created_at.toISOString(),
        };
    }

    private convertStatus(status: string): CourseInvitationStatus {
        switch (status) {
            case "pending":
            case "accepted":
                return status;
        }

        throw new CourseInvitationError("provider_error");
    }

    private convertError(error: unknown): CourseInvitationError {
        if (error instanceof CourseInvitationError) {
            return error;
        }

        if (error instanceof DatabaseError) {
            switch (error.code) {
                case postgresErrorCodes.invalidTextRepresentation:
                case postgresErrorCodes.numericValueOutOfRange:
                    return new CourseInvitationError("not_found");
                case postgresErrorCodes.uniqueViolation:
                    return new CourseInvitationError("invitation_exists");
            }
        }

        return new CourseInvitationError("provider_error");
    }
}
