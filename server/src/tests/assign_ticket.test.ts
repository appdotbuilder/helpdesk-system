import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, complaintTicketsTable, ticketHistoryTable } from '../db/schema';
import { type AssignTicketInput, type CreateUserInput, type CreateComplaintTicketInput } from '../schema';
import { assignTicket, transferTicketToTeam } from '../handlers/assign_ticket';
import { eq } from 'drizzle-orm';

// Test data
const csUser: CreateUserInput = {
  username: 'cs_user',
  email: 'cs@example.com',
  full_name: 'CS User',
  role: 'CS',
  is_active: true
};

const tsoUser: CreateUserInput = {
  username: 'tso_user',
  email: 'tso@example.com',
  full_name: 'TSO User',
  role: 'TSO',
  is_active: true
};

const nocUser: CreateUserInput = {
  username: 'noc_user',
  email: 'noc@example.com',
  full_name: 'NOC User',
  role: 'NOC',
  is_active: true
};

const inactiveUser: CreateUserInput = {
  username: 'inactive_user',
  email: 'inactive@example.com',
  full_name: 'Inactive User',
  role: 'TSO',
  is_active: false
};

describe('assignTicket', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let csUserId: number;
  let tsoUserId: number;
  let nocUserId: number;
  let inactiveUserId: number;
  let ticketId: number;

  beforeEach(async () => {
    // Create test users
    const createdCsUsers = await db.insert(usersTable)
      .values(csUser)
      .returning()
      .execute();
    csUserId = createdCsUsers[0].id;

    const createdTsoUsers = await db.insert(usersTable)
      .values(tsoUser)
      .returning()
      .execute();
    tsoUserId = createdTsoUsers[0].id;

    const createdNocUsers = await db.insert(usersTable)
      .values(nocUser)
      .returning()
      .execute();
    nocUserId = createdNocUsers[0].id;

    const createdInactiveUsers = await db.insert(usersTable)
      .values(inactiveUser)
      .returning()
      .execute();
    inactiveUserId = createdInactiveUsers[0].id;

    // Create test ticket
    const testTicket: CreateComplaintTicketInput = {
      customer_id: 'CUST001',
      customer_name: 'Test Customer',
      customer_address: '123 Test St',
      customer_category: 'broadband',
      issue_description: 'Internet connection problem',
      issue_priority: 'High',
      created_by: csUserId
    };

    const createdTickets = await db.insert(complaintTicketsTable)
      .values(testTicket)
      .returning()
      .execute();
    ticketId = createdTickets[0].id;
  });

  it('should assign ticket to a specific user', async () => {
    const input: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: tsoUserId,
      assigned_team: 'TSO',
      assigned_by: csUserId
    };

    const result = await assignTicket(input);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(ticketId);
    expect(result!.assigned_to).toEqual(tsoUserId);
    expect(result!.assigned_team).toEqual('TSO');
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should assign ticket to a team without specific user', async () => {
    const input: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: null,
      assigned_team: 'NOC',
      assigned_by: csUserId
    };

    const result = await assignTicket(input);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(ticketId);
    expect(result!.assigned_to).toBeNull();
    expect(result!.assigned_team).toEqual('NOC');
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should create history entry when assigning to user', async () => {
    const input: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: tsoUserId,
      assigned_team: 'TSO',
      assigned_by: csUserId
    };

    await assignTicket(input);

    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0].action).toEqual('assigned_to_user');
    expect(historyEntries[0].new_value).toEqual(`User ID: ${tsoUserId}, Team: TSO`);
    expect(historyEntries[0].performed_by).toEqual(csUserId);
    expect(historyEntries[0].notes).toContain('assigned to user');
  });

  it('should create history entry when assigning to team only', async () => {
    const input: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: null,
      assigned_team: 'NOC',
      assigned_by: csUserId
    };

    await assignTicket(input);

    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0].action).toEqual('assigned_to_team');
    expect(historyEntries[0].new_value).toEqual('Team: NOC');
    expect(historyEntries[0].performed_by).toEqual(csUserId);
    expect(historyEntries[0].notes).toContain('assigned to NOC team');
  });

  it('should handle reassignment and track previous values', async () => {
    // First assignment
    const firstInput: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: tsoUserId,
      assigned_team: 'TSO',
      assigned_by: csUserId
    };
    await assignTicket(firstInput);

    // Reassignment
    const secondInput: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: nocUserId,
      assigned_team: 'NOC',
      assigned_by: csUserId
    };
    const result = await assignTicket(secondInput);

    expect(result!.assigned_to).toEqual(nocUserId);
    expect(result!.assigned_team).toEqual('NOC');

    // Check history entries
    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    expect(historyEntries).toHaveLength(2);
    
    const reassignmentEntry = historyEntries.find(h => h.previous_value !== null);
    expect(reassignmentEntry).toBeDefined();
    expect(reassignmentEntry!.previous_value).toEqual(`User ID: ${tsoUserId}, Team: TSO`);
    expect(reassignmentEntry!.new_value).toEqual(`User ID: ${nocUserId}, Team: NOC`);
  });

  it('should throw error when ticket does not exist', async () => {
    const input: AssignTicketInput = {
      ticket_id: 99999,
      assigned_to: tsoUserId,
      assigned_team: 'TSO',
      assigned_by: csUserId
    };

    expect(assignTicket(input)).rejects.toThrow(/ticket with id 99999 not found/i);
  });

  it('should throw error when assigner does not exist', async () => {
    const input: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: tsoUserId,
      assigned_team: 'TSO',
      assigned_by: 99999
    };

    expect(assignTicket(input)).rejects.toThrow(/user with id 99999 not found/i);
  });

  it('should throw error when assignee does not exist', async () => {
    const input: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: 99999,
      assigned_team: 'TSO',
      assigned_by: csUserId
    };

    expect(assignTicket(input)).rejects.toThrow(/active user with id 99999 and role TSO not found/i);
  });

  it('should throw error when assignee role does not match team', async () => {
    const input: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: tsoUserId, // TSO user
      assigned_team: 'NOC',   // But assigning to NOC team
      assigned_by: csUserId
    };

    expect(assignTicket(input)).rejects.toThrow(/active user with id .+ and role NOC not found/i);
  });

  it('should throw error when assignee is inactive', async () => {
    const input: AssignTicketInput = {
      ticket_id: ticketId,
      assigned_to: inactiveUserId,
      assigned_team: 'TSO',
      assigned_by: csUserId
    };

    expect(assignTicket(input)).rejects.toThrow(/active user with id .+ and role TSO not found/i);
  });
});

describe('transferTicketToTeam', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let csUserId: number;
  let tsoUserId: number;
  let ticketId: number;

  beforeEach(async () => {
    // Create test users
    const createdCsUsers = await db.insert(usersTable)
      .values(csUser)
      .returning()
      .execute();
    csUserId = createdCsUsers[0].id;

    const createdTsoUsers = await db.insert(usersTable)
      .values(tsoUser)
      .returning()
      .execute();
    tsoUserId = createdTsoUsers[0].id;

    // Create test ticket assigned to TSO user
    const testTicket: CreateComplaintTicketInput = {
      customer_id: 'CUST001',
      customer_name: 'Test Customer',
      customer_address: '123 Test St',
      customer_category: 'broadband',
      issue_description: 'Internet connection problem',
      issue_priority: 'High',
      created_by: csUserId
    };

    const createdTickets = await db.insert(complaintTicketsTable)
      .values({
        ...testTicket,
        assigned_to: tsoUserId,
        assigned_team: 'TSO'
      })
      .returning()
      .execute();
    ticketId = createdTickets[0].id;
  });

  it('should transfer ticket to new team and clear individual assignment', async () => {
    const result = await transferTicketToTeam(ticketId, 'NOC', csUserId);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(ticketId);
    expect(result!.assigned_to).toBeNull(); // Individual assignment cleared
    expect(result!.assigned_team).toEqual('NOC');
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should create history entry for team transfer', async () => {
    await transferTicketToTeam(ticketId, 'NOC', csUserId);

    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0].action).toEqual('transferred_to_team');
    expect(historyEntries[0].previous_value).toEqual(`User ID: ${tsoUserId}, Team: TSO`);
    expect(historyEntries[0].new_value).toEqual('Team: NOC');
    expect(historyEntries[0].performed_by).toEqual(csUserId);
    expect(historyEntries[0].notes).toContain('transferred to NOC team');
  });

  it('should handle transfer from team-only assignment', async () => {
    // First clear individual assignment to simulate team-only assignment
    await db.update(complaintTicketsTable)
      .set({ assigned_to: null })
      .where(eq(complaintTicketsTable.id, ticketId))
      .execute();

    const result = await transferTicketToTeam(ticketId, 'NOC', csUserId);

    expect(result!.assigned_to).toBeNull();
    expect(result!.assigned_team).toEqual('NOC');

    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0].previous_value).toEqual('Team: TSO');
    expect(historyEntries[0].new_value).toEqual('Team: NOC');
  });

  it('should throw error when ticket does not exist', async () => {
    expect(transferTicketToTeam(99999, 'NOC', csUserId)).rejects.toThrow(/ticket with id 99999 not found/i);
  });

  it('should throw error when transferrer does not exist', async () => {
    expect(transferTicketToTeam(ticketId, 'NOC', 99999)).rejects.toThrow(/user with id 99999 not found/i);
  });

  it('should throw error when targetTeam is invalid', async () => {
    expect(transferTicketToTeam(ticketId, 'INVALID_TEAM', csUserId)).rejects.toThrow(/invalid target team/i);
  });
});