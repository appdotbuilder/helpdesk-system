import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, complaintTicketsTable } from '../db/schema';
import { getDashboardMetrics, getUserDashboard } from '../handlers/dashboard';
import type { CreateUserInput, CreateComplaintTicketInput } from '../schema';
import { eq } from 'drizzle-orm';

describe('dashboard handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test users
  const createTestUser = async (userData: CreateUserInput) => {
    const result = await db.insert(usersTable)
      .values({
        username: userData.username,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        is_active: userData.is_active ?? true
      })
      .returning()
      .execute();
    return result[0];
  };

  // Helper function to create test tickets
  const createTestTicket = async (ticketData: CreateComplaintTicketInput & {
    status?: string;
    assigned_to?: number | null;
    assigned_team?: string | null;
    resolved_at?: Date | null;
  }) => {
    const result = await db.insert(complaintTicketsTable)
      .values({
        customer_id: ticketData.customer_id,
        customer_name: ticketData.customer_name,
        customer_address: ticketData.customer_address,
        customer_category: ticketData.customer_category,
        issue_description: ticketData.issue_description,
        issue_priority: ticketData.issue_priority,
        created_by: ticketData.created_by,
        status: ticketData.status as any || 'New',
        assigned_to: ticketData.assigned_to,
        assigned_team: ticketData.assigned_team as any,
        resolved_at: ticketData.resolved_at
      })
      .returning()
      .execute();
    return result[0];
  };

  describe('getDashboardMetrics', () => {
    it('should return default metrics when no tickets exist', async () => {
      const result = await getDashboardMetrics();

      expect(result.totalTickets).toEqual(0);
      expect(result.ticketsByStatus).toEqual({
        'New': 0,
        'In Progress': 0,
        'Pending': 0,
        'Cancel': 0,
        'Solved': 0
      });
      expect(result.ticketsByTeam).toEqual({
        'CS': 0,
        'TSO': 0,
        'NOC': 0
      });
      expect(result.unassignedTickets).toEqual(0);
      expect(result.overduePriorityTickets).toEqual(0);
      expect(result.averageResolutionTime).toEqual(0);
      expect(result.todayCreated).toEqual(0);
      expect(result.todayResolved).toEqual(0);
    });

    it('should calculate correct metrics with various tickets', async () => {
      // Create test users
      const csUser = await createTestUser({
        username: 'cs_user',
        email: 'cs@test.com',
        full_name: 'CS User',
        role: 'CS'
      });

      const tsoUser = await createTestUser({
        username: 'tso_user',
        email: 'tso@test.com',
        full_name: 'TSO User',
        role: 'TSO'
      });

      // Create tickets with different statuses
      await createTestTicket({
        customer_id: 'CUST001',
        customer_name: 'Customer 1',
        customer_address: 'Address 1',
        customer_category: 'broadband',
        issue_description: 'New ticket',
        issue_priority: 'Medium',
        created_by: csUser.id,
        status: 'New'
      });

      await createTestTicket({
        customer_id: 'CUST002',
        customer_name: 'Customer 2',
        customer_address: 'Address 2',
        customer_category: 'dedicated',
        issue_description: 'In progress ticket',
        issue_priority: 'High',
        created_by: csUser.id,
        status: 'In Progress',
        assigned_to: tsoUser.id,
        assigned_team: 'TSO'
      });

      await createTestTicket({
        customer_id: 'CUST003',
        customer_name: 'Customer 3',
        customer_address: 'Address 3',
        customer_category: 'reseller',
        issue_description: 'Solved ticket',
        issue_priority: 'Low',
        created_by: csUser.id,
        status: 'Solved',
        assigned_to: tsoUser.id,
        assigned_team: 'TSO',
        resolved_at: new Date()
      });

      const result = await getDashboardMetrics();

      expect(result.totalTickets).toEqual(3);
      expect(result.ticketsByStatus['New']).toEqual(1);
      expect(result.ticketsByStatus['In Progress']).toEqual(1);
      expect(result.ticketsByStatus['Solved']).toEqual(1);
      expect(result.ticketsByTeam['TSO']).toEqual(2);
      expect(result.unassignedTickets).toEqual(1); // The 'New' ticket is unassigned
      expect(result.todayCreated).toEqual(3); // All created today
    });

    it('should count overdue priority tickets correctly', async () => {
      const csUser = await createTestUser({
        username: 'cs_user',
        email: 'cs@test.com',
        full_name: 'CS User',
        role: 'CS'
      });

      // Create an old high priority ticket (2 days ago)
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const oldTicket = await createTestTicket({
        customer_id: 'CUST001',
        customer_name: 'Customer 1',
        customer_address: 'Address 1',
        customer_category: 'broadband',
        issue_description: 'Old high priority ticket',
        issue_priority: 'High',
        created_by: csUser.id,
        status: 'In Progress'
      });

      // Update the created_at manually to simulate old ticket
      await db.update(complaintTicketsTable)
        .set({ created_at: twoDaysAgo })
        .where(eq(complaintTicketsTable.id, oldTicket.id))
        .execute();

      // Create a recent critical ticket (should not be overdue)
      await createTestTicket({
        customer_id: 'CUST002',
        customer_name: 'Customer 2',
        customer_address: 'Address 2',
        customer_category: 'dedicated',
        issue_description: 'Recent critical ticket',
        issue_priority: 'Critical',
        created_by: csUser.id,
        status: 'New'
      });

      const result = await getDashboardMetrics();

      expect(result.overduePriorityTickets).toEqual(1); // Only the old high priority ticket
      expect(result.totalTickets).toEqual(2);
    });

    it('should calculate today created and resolved tickets', async () => {
      const csUser = await createTestUser({
        username: 'cs_user',
        email: 'cs@test.com',
        full_name: 'CS User',
        role: 'CS'
      });

      // Create today's tickets
      await createTestTicket({
        customer_id: 'CUST001',
        customer_name: 'Customer 1',
        customer_address: 'Address 1',
        customer_category: 'broadband',
        issue_description: 'Today ticket 1',
        issue_priority: 'Medium',
        created_by: csUser.id
      });

      const todayResolvedTicket = await createTestTicket({
        customer_id: 'CUST002',
        customer_name: 'Customer 2',
        customer_address: 'Address 2',
        customer_category: 'dedicated',
        issue_description: 'Today resolved ticket',
        issue_priority: 'Low',
        created_by: csUser.id,
        status: 'Solved',
        resolved_at: new Date()
      });

      // Create yesterday's ticket
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const yesterdayTicket = await createTestTicket({
        customer_id: 'CUST003',
        customer_name: 'Customer 3',
        customer_address: 'Address 3',
        customer_category: 'reseller',
        issue_description: 'Yesterday ticket',
        issue_priority: 'High',
        created_by: csUser.id
      });

      // Update created_at for yesterday's ticket
      await db.update(complaintTicketsTable)
        .set({ created_at: yesterday })
        .where(eq(complaintTicketsTable.id, yesterdayTicket.id))
        .execute();

      const result = await getDashboardMetrics();

      expect(result.todayCreated).toEqual(2); // Only today's tickets
      expect(result.todayResolved).toEqual(1); // Only today's resolved ticket
      expect(result.totalTickets).toEqual(3);
    });
  });

  describe('getUserDashboard', () => {
    it('should return user dashboard with personal metrics', async () => {
      // Create test users
      const csUser = await createTestUser({
        username: 'cs_user',
        email: 'cs@test.com',
        full_name: 'CS User',
        role: 'CS'
      });

      const tsoUser = await createTestUser({
        username: 'tso_user',
        email: 'tso@test.com',
        full_name: 'TSO User',
        role: 'TSO'
      });

      // Create tickets assigned to tsoUser
      await createTestTicket({
        customer_id: 'CUST001',
        customer_name: 'Customer 1',
        customer_address: 'Address 1',
        customer_category: 'broadband',
        issue_description: 'Assigned ticket 1',
        issue_priority: 'Medium',
        created_by: csUser.id,
        status: 'In Progress',
        assigned_to: tsoUser.id
      });

      await createTestTicket({
        customer_id: 'CUST002',
        customer_name: 'Customer 2',
        customer_address: 'Address 2',
        customer_category: 'dedicated',
        issue_description: 'Solved ticket',
        issue_priority: 'High',
        created_by: csUser.id,
        status: 'Solved',
        assigned_to: tsoUser.id,
        resolved_at: new Date()
      });

      // Create ticket not assigned to tsoUser
      await createTestTicket({
        customer_id: 'CUST003',
        customer_name: 'Customer 3',
        customer_address: 'Address 3',
        customer_category: 'reseller',
        issue_description: 'Other user ticket',
        issue_priority: 'Low',
        created_by: csUser.id
      });

      const result = await getUserDashboard(tsoUser.id);

      expect(result.user.id).toEqual(tsoUser.id);
      expect(result.user.username).toEqual('tso_user');
      expect(result.user.full_name).toEqual('TSO User');
      expect(result.user.role).toEqual('TSO');

      expect(result.personalMetrics.assignedTickets).toEqual(2);
      expect(result.personalMetrics.ticketsInProgress).toEqual(1);
      expect(result.personalMetrics.ticketsResolved).toEqual(1);
      expect(typeof result.personalMetrics.averageResolutionTime).toEqual('number');

      expect(result.recentTickets).toHaveLength(2);
      expect(result.recentTickets[0].customer_name).toBeDefined();
      expect(result.recentTickets[0].issue_description).toBeDefined();
      expect(result.recentTickets[0].status).toBeDefined();
      expect(result.recentTickets[0].priority).toBeDefined();
      expect(result.recentTickets[0].created_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent user', async () => {
      await expect(getUserDashboard(999)).rejects.toThrow('User with ID 999 not found');
    });

    it('should return empty metrics for user with no assigned tickets', async () => {
      const user = await createTestUser({
        username: 'new_user',
        email: 'new@test.com',
        full_name: 'New User',
        role: 'NOC'
      });

      const result = await getUserDashboard(user.id);

      expect(result.user.id).toEqual(user.id);
      expect(result.personalMetrics.assignedTickets).toEqual(0);
      expect(result.personalMetrics.ticketsInProgress).toEqual(0);
      expect(result.personalMetrics.ticketsResolved).toEqual(0);
      expect(result.personalMetrics.averageResolutionTime).toEqual(0);
      expect(result.recentTickets).toHaveLength(0);
    });

    it('should limit recent tickets to 10', async () => {
      const csUser = await createTestUser({
        username: 'cs_user',
        email: 'cs@test.com',
        full_name: 'CS User',
        role: 'CS'
      });

      const tsoUser = await createTestUser({
        username: 'tso_user',
        email: 'tso@test.com',
        full_name: 'TSO User',
        role: 'TSO'
      });

      // Create 15 tickets assigned to tsoUser
      for (let i = 1; i <= 15; i++) {
        await createTestTicket({
          customer_id: `CUST${i.toString().padStart(3, '0')}`,
          customer_name: `Customer ${i}`,
          customer_address: `Address ${i}`,
          customer_category: 'broadband',
          issue_description: `Ticket ${i}`,
          issue_priority: 'Medium',
          created_by: csUser.id,
          assigned_to: tsoUser.id
        });
      }

      const result = await getUserDashboard(tsoUser.id);

      expect(result.personalMetrics.assignedTickets).toEqual(15);
      expect(result.recentTickets).toHaveLength(10); // Should be limited to 10
      
      // Should be ordered by created_at desc (most recent first)
      expect(result.recentTickets[0].customer_name).toEqual('Customer 15');
      expect(result.recentTickets[9].customer_name).toEqual('Customer 6');
    });
  });
});