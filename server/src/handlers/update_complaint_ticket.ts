import { db } from '../db';
import { complaintTicketsTable, ticketHistoryTable, usersTable } from '../db/schema';
import { type UpdateComplaintTicketInput, type ComplaintTicket } from '../schema';
import { eq, and } from 'drizzle-orm';

export const updateComplaintTicket = async (input: UpdateComplaintTicketInput): Promise<ComplaintTicket | null> => {
  try {
    const { id, ...updateData } = input;

    // Check if ticket exists first
    const existingTicket = await db.select()
      .from(complaintTicketsTable)
      .where(eq(complaintTicketsTable.id, id))
      .execute();

    if (existingTicket.length === 0) {
      return null;
    }

    const currentTicket = existingTicket[0];

    // Validate foreign key references if provided
    if (updateData.assigned_to !== undefined && updateData.assigned_to !== null) {
      const assignedUser = await db.select()
        .from(usersTable)
        .where(and(
          eq(usersTable.id, updateData.assigned_to),
          eq(usersTable.is_active, true)
        ))
        .execute();

      if (assignedUser.length === 0) {
        throw new Error(`User with ID ${updateData.assigned_to} does not exist or is not active`);
      }
    }

    // Prepare update object - only include fields that are actually being updated
    const updateFields: any = {};
    const historyEntries: any[] = [];

    // Track changes for history logging
    const trackChange = (field: string, oldValue: any, newValue: any, displayName: string) => {
      if (newValue !== undefined && oldValue !== newValue) {
        updateFields[field] = newValue;
        historyEntries.push({
          ticket_id: id,
          action: `${displayName.toLowerCase()}_changed`,
          previous_value: oldValue?.toString() || null,
          new_value: newValue?.toString() || null,
          performed_by: 1, // This would come from authentication context in real app
          notes: `${displayName} updated`
        });
      }
    };

    // Track all possible field changes
    trackChange('customer_id', currentTicket.customer_id, updateData.customer_id, 'Customer ID');
    trackChange('customer_name', currentTicket.customer_name, updateData.customer_name, 'Customer Name');
    trackChange('customer_address', currentTicket.customer_address, updateData.customer_address, 'Customer Address');
    trackChange('customer_category', currentTicket.customer_category, updateData.customer_category, 'Customer Category');
    trackChange('issue_description', currentTicket.issue_description, updateData.issue_description, 'Issue Description');
    trackChange('issue_priority', currentTicket.issue_priority, updateData.issue_priority, 'Issue Priority');
    trackChange('status', currentTicket.status, updateData.status, 'Status');
    trackChange('assigned_to', currentTicket.assigned_to, updateData.assigned_to, 'Assigned To');
    trackChange('assigned_team', currentTicket.assigned_team, updateData.assigned_team, 'Assigned Team');
    trackChange('resolution_notes', currentTicket.resolution_notes, updateData.resolution_notes, 'Resolution Notes');

    // If no changes detected, return current ticket
    if (Object.keys(updateFields).length === 0) {
      return currentTicket;
    }

    // Set resolved_at timestamp if status is being changed to 'Solved'
    if (updateData.status === 'Solved' && currentTicket.status !== 'Solved') {
      updateFields.resolved_at = new Date();
    }

    // Clear resolved_at if status is changed from 'Solved' to something else
    if (updateData.status && updateData.status !== 'Solved' && currentTicket.status === 'Solved') {
      updateFields.resolved_at = null;
    }

    // Always update the updated_at timestamp
    updateFields.updated_at = new Date();

    // Perform the update
    const result = await db.update(complaintTicketsTable)
      .set(updateFields)
      .where(eq(complaintTicketsTable.id, id))
      .returning()
      .execute();

    // Log changes in ticket history
    if (historyEntries.length > 0) {
      await db.insert(ticketHistoryTable)
        .values(historyEntries)
        .execute();
    }

    return result[0];
  } catch (error) {
    console.error('Ticket update failed:', error);
    throw error;
  }
};