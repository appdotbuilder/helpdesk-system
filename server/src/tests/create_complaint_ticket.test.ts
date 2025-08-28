import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { complaintTicketsTable, ticketHistoryTable, usersTable } from '../db/schema';
import { type CreateComplaintTicketInput } from '../schema';
import { createComplaintTicket } from '../handlers/create_complaint_ticket';
import { eq } from 'drizzle-orm';

describe('createComplaintTicket', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Create a test user for creating tickets
  const createTestUser = async () => {
    const userResult = await db.insert(usersTable)
      .values({
        username: 'cs_agent',
        email: 'cs@example.com',
        full_name: 'CS Agent',
        role: 'CS',
        is_active: true
      })
      .returning()
      .execute();
    return userResult[0];
  };

  const testInput: CreateComplaintTicketInput = {
    customer_id: 'CUST001',
    customer_name: 'John Doe',
    customer_address: '123 Main Street, City',
    customer_category: 'broadband',
    issue_description: 'Internet connection is very slow',
    issue_priority: 'Medium',
    created_by: 1 // Will be updated with actual user ID in tests
  };

  it('should create a complaint ticket successfully', async () => {
    const testUser = await createTestUser();
    const input = { ...testInput, created_by: testUser.id };

    const result = await createComplaintTicket(input);

    // Verify basic ticket properties
    expect(result.id).toBeDefined();
    expect(result.customer_id).toEqual('CUST001');
    expect(result.customer_name).toEqual('John Doe');
    expect(result.customer_address).toEqual('123 Main Street, City');
    expect(result.customer_category).toEqual('broadband');
    expect(result.issue_description).toEqual('Internet connection is very slow');
    expect(result.issue_priority).toEqual('Medium');
    expect(result.status).toEqual('New');
    expect(result.created_by).toEqual(testUser.id);
    expect(result.assigned_to).toBeNull();
    expect(result.assigned_team).toBeNull();
    expect(result.resolution_notes).toBeNull();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.resolved_at).toBeNull();
  });

  it('should save ticket to database correctly', async () => {
    const testUser = await createTestUser();
    const input = { ...testInput, created_by: testUser.id };

    const result = await createComplaintTicket(input);

    // Verify ticket was saved to database
    const savedTickets = await db.select()
      .from(complaintTicketsTable)
      .where(eq(complaintTicketsTable.id, result.id))
      .execute();

    expect(savedTickets).toHaveLength(1);
    const savedTicket = savedTickets[0];
    expect(savedTicket.customer_id).toEqual('CUST001');
    expect(savedTicket.customer_name).toEqual('John Doe');
    expect(savedTicket.status).toEqual('New');
    expect(savedTicket.created_by).toEqual(testUser.id);
    expect(savedTicket.assigned_to).toBeNull();
  });

  it('should create ticket history entry', async () => {
    const testUser = await createTestUser();
    const input = { ...testInput, created_by: testUser.id };

    const result = await createComplaintTicket(input);

    // Verify history entry was created
    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, result.id))
      .execute();

    expect(historyEntries).toHaveLength(1);
    const historyEntry = historyEntries[0];
    expect(historyEntry.ticket_id).toEqual(result.id);
    expect(historyEntry.action).toEqual('created');
    expect(historyEntry.previous_value).toBeNull();
    expect(historyEntry.new_value).toEqual('New');
    expect(historyEntry.performed_by).toEqual(testUser.id);
    expect(historyEntry.notes).toContain('cs_agent');
    expect(historyEntry.created_at).toBeInstanceOf(Date);
  });

  it('should handle different customer categories correctly', async () => {
    const testUser = await createTestUser();
    
    const dedicatedInput = {
      ...testInput,
      created_by: testUser.id,
      customer_category: 'dedicated' as const,
      customer_id: 'CUST002'
    };

    const result = await createComplaintTicket(dedicatedInput);
    
    expect(result.customer_category).toEqual('dedicated');
    expect(result.customer_id).toEqual('CUST002');
  });

  it('should handle different issue priorities correctly', async () => {
    const testUser = await createTestUser();
    
    const criticalInput = {
      ...testInput,
      created_by: testUser.id,
      issue_priority: 'Critical' as const,
      customer_id: 'CUST003'
    };

    const result = await createComplaintTicket(criticalInput);
    
    expect(result.issue_priority).toEqual('Critical');
  });

  it('should throw error when creating user does not exist', async () => {
    const input = { ...testInput, created_by: 9999 };

    await expect(createComplaintTicket(input))
      .rejects.toThrow(/User with ID 9999 not found/i);
  });

  it('should throw error when creating user is not active', async () => {
    // Create inactive user
    const inactiveUserResult = await db.insert(usersTable)
      .values({
        username: 'inactive_user',
        email: 'inactive@example.com',
        full_name: 'Inactive User',
        role: 'CS',
        is_active: false
      })
      .returning()
      .execute();

    const input = { ...testInput, created_by: inactiveUserResult[0].id };

    await expect(createComplaintTicket(input))
      .rejects.toThrow(/User with ID .* is not active/i);
  });

  it('should create multiple tickets with different customers', async () => {
    const testUser = await createTestUser();
    
    const input1 = { ...testInput, created_by: testUser.id, customer_id: 'CUST001' };
    const input2 = { ...testInput, created_by: testUser.id, customer_id: 'CUST002', customer_name: 'Jane Smith' };

    const result1 = await createComplaintTicket(input1);
    const result2 = await createComplaintTicket(input2);

    expect(result1.customer_id).toEqual('CUST001');
    expect(result2.customer_id).toEqual('CUST002');
    expect(result1.customer_name).toEqual('John Doe');
    expect(result2.customer_name).toEqual('Jane Smith');
    expect(result1.id).not.toEqual(result2.id);
  });

  it('should handle long issue descriptions', async () => {
    const testUser = await createTestUser();
    const longDescription = 'This is a very long issue description that describes the problem in great detail. '.repeat(10);
    
    const input = {
      ...testInput,
      created_by: testUser.id,
      issue_description: longDescription
    };

    const result = await createComplaintTicket(input);
    
    expect(result.issue_description).toEqual(longDescription);
  });
});