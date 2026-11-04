import { RetryableStageError } from "./pipeline.ts";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";

const identitySchema = z.object({ runId: z.string().min(1), deliveryId: z.string().optional() });
export class PostgresContinuationInbox {
    private readonly db: Pool;
    constructor(db: Pool) {
        this.db = db;
    }
    async process(body: string, leaseSeconds: number, work: () => Promise<void>): Promise<void> {
        const message = identitySchema.parse(JSON.parse(body));
        const id = message.deliveryId ?? createHash("sha256").update(body).digest("hex");
        const owner = randomUUID();
        const claimed = await this.db.query(
            `INSERT INTO processing_deliveries(delivery_id,run_id,owner,lease_until) VALUES($1,$2,$3,now()+$4*interval '1 second')
             ON CONFLICT(delivery_id) DO UPDATE SET owner=EXCLUDED.owner,lease_until=EXCLUDED.lease_until
             WHERE NOT processing_deliveries.completed AND processing_deliveries.lease_until<=now() RETURNING owner`,
            [id, message.runId, owner, leaseSeconds],
        );
        if (!claimed.rowCount) {
            const receipt = await this.db.query<{ completed: boolean }>(
                "SELECT completed FROM processing_deliveries WHERE delivery_id=$1",
                [id],
            );
            if (receipt.rows[0]?.completed) return;
            throw new RetryableStageError("DELIVERY_BUSY", "This continuation is already running.");
        }
        try {
            await work();
            await this.db.query("UPDATE processing_deliveries SET completed=true WHERE delivery_id=$1 AND owner=$2", [id, owner]);
        } catch (error) {
            await this.db.query("DELETE FROM processing_deliveries WHERE delivery_id=$1 AND owner=$2 AND NOT completed", [id, owner]);
            throw error;
        }
    }
}
