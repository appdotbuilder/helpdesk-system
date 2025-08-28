import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, complaintTicketsTable } from '../db/schema';
import { 
  generateMonthlyReport, 
  getUserWorkloadStats, 
  getIssueTypeAnalysis, 
  getCustomerFrequencyAnalysis, 
  getTeamPerformanceMetrics 
} from '../handlers/reports';
import type { 
  MonthlyReportQuery, 
  WorkloadAnalysisQuery 
} from '../schema';

describe('Reports', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test users
  const createTestUsers = async () => {
    const users = await db.insert(usersTable)
      .values([
        {
          username: 'cs_user',
          email: 'cs@test.com',
          full_name: 'CS User',
          role: 'CS',
          is_active: true
        },
        {
          username: 'tso_user', 
          email: 'tso@test.com',
          full_name: 'TSO User',
          role: 'TSO',
          is_active: true
        },
        {
          username: 'noc_user',
          email: 'noc@test.com', 
          full_name: 'NOC User',
          role: 'NOC',
          is_active: true
        }
      ])
      .returning()
      .execute();
    
    return users;
  };

  // Helper function to create test tickets
  const createTestTickets = async (users: any[]) => {
    const baseDate = new Date('2024-01-15');
    const resolvedDate = new Date('2024-01-16');
    
    const tickets = await db.insert(complaintTicketsTable)
      .values([
        {
          customer_id: 'CUST001',
          customer_name: 'Customer One',
          customer_address: '123 Main St',
          customer_category: 'broadband',
          issue_description: 'Internet connection issues',
          issue_priority: 'High',
          status: 'Solved',
          created_by: users[0].id,
          assigned_to: users[1].id,
          assigned_team: 'TSO',
          resolution_notes: 'Fixed connection',
          created_at: baseDate,
          resolved_at: resolvedDate
        },
        {
          customer_id: 'CUST001',
          customer_name: 'Customer One',
          customer_address: '123 Main St',
          customer_category: 'broadband',
          issue_description: 'Slow internet speed',
          issue_priority: 'Medium',
          status: 'In Progress',
          created_by: users[0].id,
          assigned_to: users[1].id,
          assigned_team: 'TSO',
          created_at: baseDate
        },
        {
          customer_id: 'CUST002',
          customer_name: 'Customer Two',
          customer_address: '456 Oak Ave',
          customer_category: 'dedicated',
          issue_description: 'Service outage',
          issue_priority: 'Critical',
          status: 'Pending',
          created_by: users[0].id,
          assigned_to: users[2].id,
          assigned_team: 'NOC',
          created_at: baseDate
        },
        {
          customer_id: 'CUST003',
          customer_name: 'Customer Three',
          customer_address: '789 Pine Rd',
          customer_category: 'reseller',
          issue_description: 'Billing inquiry',
          issue_priority: 'Low',
          status: 'New',
          created_by: users[0].id,
          created_at: baseDate
        }
      ])
      .returning()
      .execute();
    
    return tickets;
  };

  describe('generateMonthlyReport', () => {
    it('should generate monthly report for all teams', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const query: MonthlyReportQuery = {
        year: 2024,
        month: 1
      };

      const result = await generateMonthlyReport(query);

      expect(result.period).toBeDefined();
      expect(result.period.year).toEqual(2024);
      expect(result.period.month).toEqual(1);
      expect(result.period.start_date).toBeInstanceOf(Date);
      expect(result.period.end_date).toBeInstanceOf(Date);

      expect(result.summary).toBeDefined();
      expect(result.summary.total_tickets).toEqual(4);
      expect(result.summary.resolved_tickets).toEqual(1);
      expect(result.summary.in_progress_tickets).toEqual(1);
      expect(result.summary.pending_tickets).toEqual(1);
      expect(result.summary.new_tickets).toEqual(1);
      expect(result.summary.resolution_rate).toEqual(25); // 1 resolved out of 4 total
      expect(typeof result.summary.avg_resolution_time_hours).toEqual('number');

      expect(result.priority_breakdown).toBeInstanceOf(Array);
      expect(result.category_breakdown).toBeInstanceOf(Array);
      expect(result.team).toEqual('All Teams');
    });

    it('should generate monthly report for specific team', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const query: MonthlyReportQuery = {
        year: 2024,
        month: 1,
        team: 'TSO'
      };

      const result = await generateMonthlyReport(query);

      expect(result.summary.total_tickets).toEqual(2); // Only TSO assigned tickets
      expect(result.team).toEqual('TSO');
    });

    it('should return empty report for month with no tickets', async () => {
      const users = await createTestUsers();

      const query: MonthlyReportQuery = {
        year: 2024,
        month: 3 // No tickets in March
      };

      const result = await generateMonthlyReport(query);

      expect(result.summary.total_tickets).toEqual(0);
      expect(result.summary.resolved_tickets).toEqual(0);
      expect(result.summary.resolution_rate).toEqual(0);
      expect(result.priority_breakdown).toHaveLength(0);
      expect(result.category_breakdown).toHaveLength(0);
    });
  });

  describe('getUserWorkloadStats', () => {
    it('should return workload stats for all users', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const query: WorkloadAnalysisQuery = {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-01-31')
      };

      const result = await getUserWorkloadStats(query);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      
      const tsoUser = result.find(user => user.team === 'TSO');
      expect(tsoUser).toBeDefined();
      expect(tsoUser!.total_tickets_handled).toEqual(2);
      expect(tsoUser!.tickets_resolved).toEqual(1);
      expect(tsoUser!.tickets_in_progress).toEqual(1);
    });

    it('should filter workload stats by specific user', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const query: WorkloadAnalysisQuery = {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-01-31'),
        user_id: users[1].id // TSO user
      };

      const result = await getUserWorkloadStats(query);

      expect(result).toHaveLength(1);
      expect(result[0].username).toEqual('tso_user');
      expect(result[0].total_tickets_handled).toEqual(2);
    });

    it('should filter workload stats by team', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const query: WorkloadAnalysisQuery = {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-01-31'),
        team: 'NOC'
      };

      const result = await getUserWorkloadStats(query);

      expect(result).toHaveLength(1);
      expect(result[0].team).toEqual('NOC');
      expect(result[0].total_tickets_handled).toEqual(1);
    });
  });

  describe('getIssueTypeAnalysis', () => {
    it('should analyze issue types with percentages', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const result = await getIssueTypeAnalysis(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);

      // Check that percentages add up correctly for categories
      const categoryStats = result.filter(stat => 
        ['broadband', 'dedicated', 'reseller'].includes(stat.issue_type)
      );
      
      const totalCategoryPercentage = categoryStats.reduce((sum, stat) => sum + stat.percentage, 0);
      expect(totalCategoryPercentage).toEqual(100);

      // Verify structure of each stat
      result.forEach(stat => {
        expect(stat.issue_type).toBeDefined();
        expect(typeof stat.count).toEqual('number');
        expect(typeof stat.percentage).toEqual('number');
        expect(stat.percentage).toBeGreaterThanOrEqual(0);
        expect(stat.percentage).toBeLessThanOrEqual(100);
      });
    });

    it('should return empty array for date range with no tickets', async () => {
      const result = await getIssueTypeAnalysis(
        new Date('2024-03-01'),
        new Date('2024-03-31')
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('getCustomerFrequencyAnalysis', () => {
    it('should identify customers with multiple complaints', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const result = await getCustomerFrequencyAnalysis(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toEqual(1); // Only CUST001 has multiple complaints
      
      const frequentCustomer = result[0];
      expect(frequentCustomer.customer_id).toEqual('CUST001');
      expect(frequentCustomer.customer_name).toEqual('Customer One');
      expect(frequentCustomer.complaint_count).toEqual(2);
      expect(frequentCustomer.last_complaint_date).toBeInstanceOf(Date);
    });

    it('should return empty array when no customers have multiple complaints', async () => {
      const users = await createTestUsers();
      
      // Create only one ticket per customer
      await db.insert(complaintTicketsTable)
        .values([
          {
            customer_id: 'CUST001',
            customer_name: 'Customer One',
            customer_address: '123 Main St',
            customer_category: 'broadband',
            issue_description: 'Internet issues',
            issue_priority: 'High',
            status: 'New',
            created_by: users[0].id,
            created_at: new Date('2024-01-15')
          }
        ])
        .execute();

      const result = await getCustomerFrequencyAnalysis(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('getTeamPerformanceMetrics', () => {
    it('should return performance metrics for all teams', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const result = await getTeamPerformanceMetrics();

      expect(result.team_metrics).toBeInstanceOf(Array);
      expect(result.team_metrics.length).toBeGreaterThan(0);

      const tsoTeam = result.team_metrics.find((team: any) => team.team === 'TSO');
      expect(tsoTeam).toBeDefined();
      expect(tsoTeam.total_tickets).toEqual(2);
      expect(tsoTeam.resolved_tickets).toEqual(1);
      expect(tsoTeam.resolution_rate).toEqual(50); // 1 resolved out of 2 total
      expect(typeof tsoTeam.avg_resolution_time_hours).toEqual('number');
    });

    it('should filter performance metrics by specific team', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const result = await getTeamPerformanceMetrics('TSO');

      expect(result.team_metrics).toHaveLength(1);
      expect(result.team_metrics[0].team).toEqual('TSO');
      expect(result.team_metrics[0].total_tickets).toEqual(2);
    });

    it('should filter performance metrics by date range', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const result = await getTeamPerformanceMetrics(
        undefined,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.period).toBeDefined();
      expect(result.period.start_date).toBeInstanceOf(Date);
      expect(result.period.end_date).toBeInstanceOf(Date);
      expect(result.team_metrics).toBeInstanceOf(Array);
    });

    it('should calculate efficiency scores correctly', async () => {
      const users = await createTestUsers();
      await createTestTickets(users);

      const result = await getTeamPerformanceMetrics();

      result.team_metrics.forEach((team: any) => {
        if (team.efficiency_score !== null) {
          expect(typeof team.efficiency_score).toEqual('number');
          expect(team.efficiency_score).toBeGreaterThan(0);
        }
      });
    });

    it('should return empty metrics for date range with no tickets', async () => {
      const result = await getTeamPerformanceMetrics(
        undefined,
        new Date('2024-03-01'),
        new Date('2024-03-31')
      );

      expect(result.team_metrics).toHaveLength(0);
    });
  });
});