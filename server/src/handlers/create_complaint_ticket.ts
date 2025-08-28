import { db } from '../db';
import { complaintTicketsTable, ticketHistoryTable, usersTable } from '../db/schema';
import { type CreateComplaintTicketInput, type ComplaintTicket } from '../schema';
import { eq } from 'drizzle-orm';

export const createComplaintTicket = async (input: CreateComplaintTicketInput): Promise<ComplaintTicket> => {
  try {
    // First, verify that the creating user exists and is active
    const creatingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.created_by))
      .execute();

    if (creatingUser.length === 0) {
      throw new Error(`User with ID ${input.created_by} not found`);
    }

    if (!creatingUser[0].is_active) {
      throw new Error(`User with ID ${input.created_by} is not active`);
    }

    // Create the complaint ticket
    const ticketResult = await db.insert(complaintTicketsTable)
      .values({
        customer_id: input.customer_id,
        customer_name: input.customer_name,
        customer_address: input.customer_address,
        customer_category: input.customer_category,
        issue_description: input.issue_description,
        issue_priority: input.issue_priority,
        status: 'New',
        created_by: input.created_by,
        assigned_to: null,
        assigned_team: null,
        resolution_notes: null
      })
      .returning()
      .execute();

    const createdTicket = ticketResult[0];

    // Log the ticket creation in the history table
    await db.insert(ticketHistoryTable)
      .values({
        ticket_id: createdTicket.id,
        action: 'created',
        previous_value: null,
        new_value: 'New',
        performed_by: input.created_by,
        notes: `Ticket created by ${creatingUser[0].username}`
      })
      .execute();

    return createdTicket;
  } catch (error) {
    console.error('Complaint ticket creation failed:', error);
    throw error;
  }
};