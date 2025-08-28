import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, complaintTicketsTable, ticketHistoryTable } from '../db/schema';
import { type CreateTicketHistoryInput } from '../schema';
import { createTicketHistory, getTicketHistory } from '../handlers/ticket_history';
import { eq } from 'drizzle-orm';

describe('ticket_history', () => {
  let testUser: any;
  let testTicket: any;
  
  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        username: 'testuser',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'CS',
        is_active: true
      })
      .returning()
      .execute();
    
    testUser = userResult[0];
    
    // Create test ticket
    const ticketResult = await db.insert(complaintTicketsTable)
      .values({
        customer_id: 'CUST001',
        customer_name: 'Test Customer',
        customer_address: '123 Test St',
        customer_category: 'broadband',
        issue_description: 'Test issue',
        issue_priority: 'Medium',
        status: 'New',
        created_by: testUser.id
      })
      .returning()
      .execute();
    
    testTicket = ticketResult[0];
  });
  
  afterEach(resetDB);

  describe('createTicketHistory', () => {
    const testInput: CreateTicketHistoryInput = {
      ticket_id: 1, // Will be overridden with testTicket.id
      action: 'status_changed',
      previous_value: 'New',
      new_value: 'In Progress',
      performed_by: 1, // Will be overridden with testUser.id
      notes: 'Status updated by CS team'
    };

    it('should create ticket history entry', async () => {
      const input = {
        ...testInput,
        ticket_id: testTicket.id,
        performed_by: testUser.id
      };
      
      const result = await createTicketHistory(input);

      expect(result.id).toBeDefined();
      expect(result.ticket_id).toEqual(testTicket.id);
      expect(result.action).toEqual('status_changed');
      expect(result.previous_value).toEqual('New');
      expect(result.new_value).toEqual('In Progress');
      expect(result.performed_by).toEqual(testUser.id);
      expect(result.notes).toEqual('Status updated by CS team');
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save ticket history to database', async () => {
      const input = {
        ...testInput,
        ticket_id: testTicket.id,
        performed_by: testUser.id
      };
      
      const result = await createTicketHistory(input);

      const histories = await db.select()
        .from(ticketHistoryTable)
        .where(eq(ticketHistoryTable.id, result.id))
        .execute();

      expect(histories).toHaveLength(1);
      expect(histories[0].ticket_id).toEqual(testTicket.id);
      expect(histories[0].action).toEqual('status_changed');
      expect(histories[0].previous_value).toEqual('New');
      expect(histories[0].new_value).toEqual('In Progress');
      expect(histories[0].performed_by).toEqual(testUser.id);
      expect(histories[0].notes).toEqual('Status updated by CS team');
      expect(histories[0].created_at).toBeInstanceOf(Date);
    });

    it('should handle optional fields correctly', async () => {
      const minimalInput: CreateTicketHistoryInput = {
        ticket_id: testTicket.id,
        action: 'created',
        performed_by: testUser.id
      };
      
      const result = await createTicketHistory(minimalInput);

      expect(result.id).toBeDefined();
      expect(result.ticket_id).toEqual(testTicket.id);
      expect(result.action).toEqual('created');
      expect(result.previous_value).toBeNull();
      expect(result.new_value).toBeNull();
      expect(result.performed_by).toEqual(testUser.id);
      expect(result.notes).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should handle assignment changes', async () => {
      const assignmentInput: CreateTicketHistoryInput = {
        ticket_id: testTicket.id,
        action: 'assigned',
        previous_value: null,
        new_value: testUser.id.toString(),
        performed_by: testUser.id,
        notes: 'Ticket assigned to CS team'
      };
      
      const result = await createTicketHistory(assignmentInput);

      expect(result.action).toEqual('assigned');
      expect(result.previous_value).toBeNull();
      expect(result.new_value).toEqual(testUser.id.toString());
      expect(result.notes).toEqual('Ticket assigned to CS team');
    });

    it('should handle team transfers', async () => {
      const transferInput: CreateTicketHistoryInput = {
        ticket_id: testTicket.id,
        action: 'transferred',
        previous_value: 'CS',
        new_value: 'TSO',
        performed_by: testUser.id,
        notes: 'Ticket transferred from CS to TSO team'
      };
      
      const result = await createTicketHistory(transferInput);

      expect(result.action).toEqual('transferred');
      expect(result.previous_value).toEqual('CS');
      expect(result.new_value).toEqual('TSO');
      expect(result.notes).toEqual('Ticket transferred from CS to TSO team');
    });
  });

  describe('getTicketHistory', () => {
    it('should return empty array for ticket with no history', async () => {
      const result = await getTicketHistory(testTicket.id);
      
      expect(result).toHaveLength(0);
    });

    it('should return ticket history ordered by creation date (newest first)', async () => {
      // Create multiple history entries
      await createTicketHistory({
        ticket_id: testTicket.id,
        action: 'created',
        performed_by: testUser.id,
        notes: 'Ticket created'
      });

      await createTicketHistory({
        ticket_id: testTicket.id,
        action: 'status_changed',
        previous_value: 'New',
        new_value: 'In Progress',
        performed_by: testUser.id,
        notes: 'Status updated'
      });

      await createTicketHistory({
        ticket_id: testTicket.id,
        action: 'assigned',
        new_value: testUser.id.toString(),
        performed_by: testUser.id,
        notes: 'Ticket assigned'
      });

      const result = await getTicketHistory(testTicket.id);

      expect(result).toHaveLength(3);
      // Should be ordered newest first
      expect(result[0].action).toEqual('assigned');
      expect(result[1].action).toEqual('status_changed');
      expect(result[2].action).toEqual('created');
      
      // Verify all entries have required fields
      result.forEach(entry => {
        expect(entry.id).toBeDefined();
        expect(entry.ticket_id).toEqual(testTicket.id);
        expect(entry.action).toBeDefined();
        expect(entry.performed_by).toEqual(testUser.id);
        expect(entry.created_at).toBeInstanceOf(Date);
      });
    });

    it('should only return history for specified ticket', async () => {
      // Create another user and ticket
      const anotherUserResult = await db.insert(usersTable)
        .values({
          username: 'anotheruser',
          email: 'another@example.com',
          full_name: 'Another User',
          role: 'TSO',
          is_active: true
        })
        .returning()
        .execute();
      
      const anotherUser = anotherUserResult[0];
      
      const anotherTicketResult = await db.insert(complaintTicketsTable)
        .values({
          customer_id: 'CUST002',
          customer_name: 'Another Customer',
          customer_address: '456 Another St',
          customer_category: 'dedicated',
          issue_description: 'Another issue',
          issue_priority: 'High',
          status: 'New',
          created_by: anotherUser.id
        })
        .returning()
        .execute();
      
      const anotherTicket = anotherTicketResult[0];

      // Create history for both tickets
      await createTicketHistory({
        ticket_id: testTicket.id,
        action: 'created',
        performed_by: testUser.id
      });

      await createTicketHistory({
        ticket_id: anotherTicket.id,
        action: 'created',
        performed_by: anotherUser.id
      });

      // Get history for first ticket
      const result1 = await getTicketHistory(testTicket.id);
      expect(result1).toHaveLength(1);
      expect(result1[0].ticket_id).toEqual(testTicket.id);

      // Get history for second ticket
      const result2 = await getTicketHistory(anotherTicket.id);
      expect(result2).toHaveLength(1);
      expect(result2[0].ticket_id).toEqual(anotherTicket.id);
    });

    it('should handle complex audit trail scenario', async () => {
      // Create a comprehensive audit trail
      const historyEntries = [
        {
          action: 'created',
          performed_by: testUser.id,
          notes: 'Initial ticket creation'
        },
        {
          action: 'assigned',
          previous_value: null,
          new_value: testUser.id.toString(),
          performed_by: testUser.id,
          notes: 'Self-assigned by creator'
        },
        {
          action: 'status_changed',
          previous_value: 'New',
          new_value: 'In Progress',
          performed_by: testUser.id,
          notes: 'Started working on issue'
        },
        {
          action: 'transferred',
          previous_value: 'CS',
          new_value: 'TSO',
          performed_by: testUser.id,
          notes: 'Requires technical expertise'
        },
        {
          action: 'status_changed',
          previous_value: 'In Progress',
          new_value: 'Solved',
          performed_by: testUser.id,
          notes: 'Issue resolved'
        }
      ];

      // Create all history entries
      for (const entry of historyEntries) {
        await createTicketHistory({
          ticket_id: testTicket.id,
          ...entry
        });
      }

      const result = await getTicketHistory(testTicket.id);

      expect(result).toHaveLength(5);
      
      // Verify order (newest first)
      expect(result[0].action).toEqual('status_changed');
      expect(result[0].new_value).toEqual('Solved');
      expect(result[4].action).toEqual('created');
      
      // Verify data integrity
      expect(result[1].action).toEqual('transferred');
      expect(result[1].previous_value).toEqual('CS');
      expect(result[1].new_value).toEqual('TSO');
      
      expect(result[3].action).toEqual('assigned');
      expect(result[3].previous_value).toBeNull();
      expect(result[3].new_value).toEqual(testUser.id.toString());
    });
  });
});