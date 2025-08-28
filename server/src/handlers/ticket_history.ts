import { db } from '../db';
import { ticketHistoryTable, usersTable } from '../db/schema';
import { type CreateTicketHistoryInput, type TicketHistory } from '../schema';
import { eq, desc } from 'drizzle-orm';

export const createTicketHistory = async (input: CreateTicketHistoryInput): Promise<TicketHistory> => {
  try {
    // Insert ticket history record
    const result = await db.insert(ticketHistoryTable)
      .values({
        ticket_id: input.ticket_id,
        action: input.action,
        previous_value: input.previous_value || null,
        new_value: input.new_value || null,
        performed_by: input.performed_by,
        notes: input.notes || null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Ticket history creation failed:', error);
    throw error;
  }
};

export const getTicketHistory = async (ticketId: number): Promise<TicketHistory[]> => {
  try {
    // Get ticket history with performer information, ordered chronologically (newest first)
    const results = await db.select({
      id: ticketHistoryTable.id,
      ticket_id: ticketHistoryTable.ticket_id,
      action: ticketHistoryTable.action,
      previous_value: ticketHistoryTable.previous_value,
      new_value: ticketHistoryTable.new_value,
      performed_by: ticketHistoryTable.performed_by,
      notes: ticketHistoryTable.notes,
      created_at: ticketHistoryTable.created_at,
      performer_name: usersTable.full_name,
      performer_username: usersTable.username
    })
      .from(ticketHistoryTable)
      .innerJoin(usersTable, eq(ticketHistoryTable.performed_by, usersTable.id))
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .orderBy(desc(ticketHistoryTable.created_at))
      .execute();

    // Transform results to match TicketHistory schema
    return results.map(result => ({
      id: result.id,
      ticket_id: result.ticket_id,
      action: result.action,
      previous_value: result.previous_value,
      new_value: result.new_value,
      performed_by: result.performed_by,
      notes: result.notes,
      created_at: result.created_at
    }));
  } catch (error) {
    console.error('Get ticket history failed:', error);
    throw error;
  }
};