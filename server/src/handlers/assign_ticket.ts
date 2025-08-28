import { db } from '../db';
import { complaintTicketsTable, ticketHistoryTable, usersTable } from '../db/schema';
import { type AssignTicketInput, type ComplaintTicket, type UserRole } from '../schema';
import { eq, and } from 'drizzle-orm';

export const assignTicket = async (input: AssignTicketInput): Promise<ComplaintTicket | null> => {
  try {
    // Validate that the ticket exists
    const existingTickets = await db.select()
      .from(complaintTicketsTable)
      .where(eq(complaintTicketsTable.id, input.ticket_id))
      .execute();

    if (existingTickets.length === 0) {
      throw new Error(`Ticket with ID ${input.ticket_id} not found`);
    }

    const existingTicket = existingTickets[0];

    // Validate that the person making the assignment exists
    const assignerUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.assigned_by))
      .execute();

    if (assignerUsers.length === 0) {
      throw new Error(`User with ID ${input.assigned_by} not found`);
    }

    // If assigned_to is provided, validate that the assignee exists and belongs to the assigned team
    if (input.assigned_to) {
      const assigneeUsers = await db.select()
        .from(usersTable)
        .where(and(
          eq(usersTable.id, input.assigned_to),
          eq(usersTable.role, input.assigned_team),
          eq(usersTable.is_active, true)
        ))
        .execute();

      if (assigneeUsers.length === 0) {
        throw new Error(`Active user with ID ${input.assigned_to} and role ${input.assigned_team} not found`);
      }
    }

    // Update the ticket assignment
    const updatedTickets = await db.update(complaintTicketsTable)
      .set({
        assigned_to: input.assigned_to,
        assigned_team: input.assigned_team,
        updated_at: new Date()
      })
      .where(eq(complaintTicketsTable.id, input.ticket_id))
      .returning()
      .execute();

    const updatedTicket = updatedTickets[0];

    // Log the assignment action in ticket history
    const historyAction = input.assigned_to 
      ? `assigned_to_user` 
      : `assigned_to_team`;

    const previousAssignment = existingTicket.assigned_to 
      ? `User ID: ${existingTicket.assigned_to}, Team: ${existingTicket.assigned_team}`
      : existingTicket.assigned_team 
        ? `Team: ${existingTicket.assigned_team}`
        : null;

    const newAssignment = input.assigned_to
      ? `User ID: ${input.assigned_to}, Team: ${input.assigned_team}`
      : `Team: ${input.assigned_team}`;

    await db.insert(ticketHistoryTable)
      .values({
        ticket_id: input.ticket_id,
        action: historyAction,
        previous_value: previousAssignment,
        new_value: newAssignment,
        performed_by: input.assigned_by,
        notes: input.assigned_to 
          ? `Ticket assigned to user ${input.assigned_to} in ${input.assigned_team} team`
          : `Ticket assigned to ${input.assigned_team} team`
      })
      .execute();

    return updatedTicket;
  } catch (error) {
    console.error('Ticket assignment failed:', error);
    throw error;
  }
};

export const transferTicketToTeam = async (ticketId: number, targetTeam: string, transferredBy: number): Promise<ComplaintTicket | null> => {
  try {
    // Validate targetTeam is a valid UserRole
    const validRoles = ['CS', 'TSO', 'NOC'] as const;
    if (!validRoles.includes(targetTeam as any)) {
      throw new Error(`Invalid target team: ${targetTeam}. Must be one of: ${validRoles.join(', ')}`);
    }

    // Validate that the ticket exists
    const existingTickets = await db.select()
      .from(complaintTicketsTable)
      .where(eq(complaintTicketsTable.id, ticketId))
      .execute();

    if (existingTickets.length === 0) {
      throw new Error(`Ticket with ID ${ticketId} not found`);
    }

    const existingTicket = existingTickets[0];

    // Validate that the person making the transfer exists
    const transferrerUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, transferredBy))
      .execute();

    if (transferrerUsers.length === 0) {
      throw new Error(`User with ID ${transferredBy} not found`);
    }

    // Transfer the ticket - clear individual assignment and set new team
    const updatedTickets = await db.update(complaintTicketsTable)
      .set({
        assigned_to: null, // Clear individual assignment
        assigned_team: targetTeam as UserRole,
        updated_at: new Date()
      })
      .where(eq(complaintTicketsTable.id, ticketId))
      .returning()
      .execute();

    const updatedTicket = updatedTickets[0];

    // Log the transfer action in ticket history
    const previousAssignment = existingTicket.assigned_to 
      ? `User ID: ${existingTicket.assigned_to}, Team: ${existingTicket.assigned_team}`
      : existingTicket.assigned_team 
        ? `Team: ${existingTicket.assigned_team}`
        : 'Unassigned';

    const newAssignment = `Team: ${targetTeam}`;

    await db.insert(ticketHistoryTable)
      .values({
        ticket_id: ticketId,
        action: 'transferred_to_team',
        previous_value: previousAssignment,
        new_value: newAssignment,
        performed_by: transferredBy,
        notes: `Ticket transferred to ${targetTeam} team`
      })
      .execute();

    return updatedTicket;
  } catch (error) {
    console.error('Ticket transfer failed:', error);
    throw error;
  }
};