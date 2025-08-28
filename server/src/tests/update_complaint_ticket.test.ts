import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, complaintTicketsTable, ticketHistoryTable } from '../db/schema';
import { type UpdateComplaintTicketInput, type CreateComplaintTicketInput } from '../schema';
import { updateComplaintTicket } from '../handlers/update_complaint_ticket';
import { eq, and } from 'drizzle-orm';

describe('updateComplaintTicket', () => {
  let testUser: any;
  let testTicket: any;
  let assigneeUser: any;

  beforeEach(async () => {
    await createDB();

    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          username: 'testcs',
          email: 'cs@test.com',
          full_name: 'Test CS Agent',
          role: 'CS',
          is_active: true
        },
        {
          username: 'testtso',
          email: 'tso@test.com',
          full_name: 'Test TSO Agent',
          role: 'TSO',
          is_active: true
        }
      ])
      .returning()
      .execute();

    testUser = users[0];
    assigneeUser = users[1];

    // Create a test ticket
    const tickets = await db.insert(complaintTicketsTable)
      .values({
        customer_id: 'CUST001',
        customer_name: 'Test Customer',
        customer_address: '123 Test St',
        customer_category: 'broadband',
        issue_description: 'Internet not working',
        issue_priority: 'High',
        created_by: testUser.id,
        status: 'New'
      })
      .returning()
      .execute();

    testTicket = tickets[0];
  });

  afterEach(resetDB);

  it('should update ticket status', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      status: 'In Progress'
    };

    const result = await updateComplaintTicket(updateInput);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(testTicket.id);
    expect(result!.status).toEqual('In Progress');
    expect(result!.updated_at).toBeInstanceOf(Date);
    expect(result!.updated_at.getTime()).toBeGreaterThan(testTicket.updated_at.getTime());
  });

  it('should update multiple fields at once', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      status: 'In Progress',
      issue_priority: 'Critical',
      assigned_to: assigneeUser.id,
      assigned_team: 'TSO'
    };

    const result = await updateComplaintTicket(updateInput);

    expect(result).not.toBeNull();
    expect(result!.status).toEqual('In Progress');
    expect(result!.issue_priority).toEqual('Critical');
    expect(result!.assigned_to).toEqual(assigneeUser.id);
    expect(result!.assigned_team).toEqual('TSO');
  });

  it('should set resolved_at when status changes to Solved', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      status: 'Solved',
      resolution_notes: 'Issue resolved successfully'
    };

    const result = await updateComplaintTicket(updateInput);

    expect(result).not.toBeNull();
    expect(result!.status).toEqual('Solved');
    expect(result!.resolved_at).toBeInstanceOf(Date);
    expect(result!.resolution_notes).toEqual('Issue resolved successfully');
  });

  it('should clear resolved_at when status changes from Solved', async () => {
    // First set ticket to Solved
    await updateComplaintTicket({
      id: testTicket.id,
      status: 'Solved'
    });

    // Then change it back to In Progress
    const result = await updateComplaintTicket({
      id: testTicket.id,
      status: 'In Progress'
    });

    expect(result).not.toBeNull();
    expect(result!.status).toEqual('In Progress');
    expect(result!.resolved_at).toBeNull();
  });

  it('should log changes in ticket history', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      status: 'In Progress',
      issue_priority: 'Critical'
    };

    await updateComplaintTicket(updateInput);

    // Check history entries were created
    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, testTicket.id))
      .execute();

    expect(historyEntries.length).toBeGreaterThan(0);

    const statusChangeEntry = historyEntries.find(entry => entry.action === 'status_changed');
    const priorityChangeEntry = historyEntries.find(entry => entry.action === 'issue priority_changed');

    expect(statusChangeEntry).toBeDefined();
    expect(statusChangeEntry!.previous_value).toEqual('New');
    expect(statusChangeEntry!.new_value).toEqual('In Progress');

    expect(priorityChangeEntry).toBeDefined();
    expect(priorityChangeEntry!.previous_value).toEqual('High');
    expect(priorityChangeEntry!.new_value).toEqual('Critical');
  });

  it('should return null for non-existent ticket', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: 99999,
      status: 'In Progress'
    };

    const result = await updateComplaintTicket(updateInput);

    expect(result).toBeNull();
  });

  it('should return current ticket if no changes are made', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      status: 'New', // Same as current status
      issue_priority: 'High' // Same as current priority
    };

    const result = await updateComplaintTicket(updateInput);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(testTicket.id);
    expect(result!.updated_at.getTime()).toEqual(testTicket.updated_at.getTime()); // Should not change
  });

  it('should validate assigned_to user exists and is active', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      assigned_to: 99999 // Non-existent user
    };

    await expect(updateComplaintTicket(updateInput))
      .rejects.toThrow(/User with ID 99999 does not exist or is not active/i);
  });

  it('should reject assignment to inactive user', async () => {
    // Create an inactive user
    const inactiveUser = await db.insert(usersTable)
      .values({
        username: 'inactive',
        email: 'inactive@test.com',
        full_name: 'Inactive User',
        role: 'TSO',
        is_active: false
      })
      .returning()
      .execute();

    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      assigned_to: inactiveUser[0].id
    };

    await expect(updateComplaintTicket(updateInput))
      .rejects.toThrow(/does not exist or is not active/i);
  });

  it('should allow assigning to null (unassign)', async () => {
    // First assign to someone
    await updateComplaintTicket({
      id: testTicket.id,
      assigned_to: assigneeUser.id
    });

    // Then unassign
    const result = await updateComplaintTicket({
      id: testTicket.id,
      assigned_to: null
    });

    expect(result).not.toBeNull();
    expect(result!.assigned_to).toBeNull();
  });

  it('should update customer information', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      customer_name: 'Updated Customer Name',
      customer_address: '456 New Address',
      customer_category: 'dedicated'
    };

    const result = await updateComplaintTicket(updateInput);

    expect(result).not.toBeNull();
    expect(result!.customer_name).toEqual('Updated Customer Name');
    expect(result!.customer_address).toEqual('456 New Address');
    expect(result!.customer_category).toEqual('dedicated');
  });

  it('should update issue description and resolution notes', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      issue_description: 'Updated issue description with more details',
      resolution_notes: 'Troubleshooting steps taken'
    };

    const result = await updateComplaintTicket(updateInput);

    expect(result).not.toBeNull();
    expect(result!.issue_description).toEqual('Updated issue description with more details');
    expect(result!.resolution_notes).toEqual('Troubleshooting steps taken');
  });

  it('should persist changes in database', async () => {
    const updateInput: UpdateComplaintTicketInput = {
      id: testTicket.id,
      status: 'Solved',
      resolution_notes: 'Problem fixed'
    };

    await updateComplaintTicket(updateInput);

    // Query database directly to verify persistence
    const tickets = await db.select()
      .from(complaintTicketsTable)
      .where(eq(complaintTicketsTable.id, testTicket.id))
      .execute();

    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toEqual('Solved');
    expect(tickets[0].resolution_notes).toEqual('Problem fixed');
    expect(tickets[0].resolved_at).toBeInstanceOf(Date);
  });
});