import { db } from '../db';
import { complaintTicketsTable, usersTable } from '../db/schema';
import { type TicketStatus, type UserRole } from '../schema';
import { count, eq, isNull, and, gte, desc, avg, sql } from 'drizzle-orm';

export interface DashboardMetrics {
  totalTickets: number;
  ticketsByStatus: Record<TicketStatus, number>;
  ticketsByTeam: Record<UserRole, number>;
  unassignedTickets: number;
  overduePriorityTickets: number;
  averageResolutionTime: number;
  todayCreated: number;
  todayResolved: number;
}

export interface UserDashboardData {
  user: {
    id: number;
    username: string;
    full_name: string;
    role: UserRole;
  };
  personalMetrics: {
    assignedTickets: number;
    ticketsInProgress: number;
    ticketsResolved: number;
    averageResolutionTime: number;
  };
  recentTickets: Array<{
    id: number;
    customer_name: string;
    issue_description: string;
    status: TicketStatus;
    priority: string;
    created_at: Date;
  }>;
}

export const getDashboardMetrics = async (): Promise<DashboardMetrics> => {
  try {
    // Get total tickets count
    const totalTicketsResult = await db
      .select({ count: count() })
      .from(complaintTicketsTable)
      .execute();
    const totalTickets = totalTicketsResult[0].count;

    // Get tickets by status
    const statusResults = await db
      .select({
        status: complaintTicketsTable.status,
        count: count()
      })
      .from(complaintTicketsTable)
      .groupBy(complaintTicketsTable.status)
      .execute();

    const ticketsByStatus: Record<TicketStatus, number> = {
      'New': 0,
      'In Progress': 0,
      'Pending': 0,
      'Cancel': 0,
      'Solved': 0
    };

    statusResults.forEach(result => {
      ticketsByStatus[result.status as TicketStatus] = result.count;
    });

    // Get tickets by team
    const teamResults = await db
      .select({
        team: complaintTicketsTable.assigned_team,
        count: count()
      })
      .from(complaintTicketsTable)
      .where(sql`${complaintTicketsTable.assigned_team} IS NOT NULL`)
      .groupBy(complaintTicketsTable.assigned_team)
      .execute();

    const ticketsByTeam: Record<UserRole, number> = {
      'CS': 0,
      'TSO': 0,
      'NOC': 0
    };

    teamResults.forEach(result => {
      if (result.team) {
        ticketsByTeam[result.team as UserRole] = result.count;
      }
    });

    // Get unassigned tickets
    const unassignedResult = await db
      .select({ count: count() })
      .from(complaintTicketsTable)
      .where(isNull(complaintTicketsTable.assigned_to))
      .execute();
    const unassignedTickets = unassignedResult[0].count;

    // Get overdue priority tickets (High/Critical tickets older than 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const overdueResult = await db
      .select({ count: count() })
      .from(complaintTicketsTable)
      .where(
        and(
          sql`${complaintTicketsTable.issue_priority} IN ('High', 'Critical')`,
          sql`${complaintTicketsTable.created_at} <= ${oneDayAgo}`,
          sql`${complaintTicketsTable.status} NOT IN ('Solved', 'Cancel')`
        )
      )
      .execute();
    const overduePriorityTickets = overdueResult[0].count;

    // Calculate average resolution time in hours
    const avgResolutionResult = await db
      .select({
        avg: avg(
          sql`EXTRACT(EPOCH FROM (${complaintTicketsTable.resolved_at} - ${complaintTicketsTable.created_at})) / 3600`
        )
      })
      .from(complaintTicketsTable)
      .where(
        and(
          sql`${complaintTicketsTable.resolved_at} IS NOT NULL`,
          eq(complaintTicketsTable.status, 'Solved')
        )
      )
      .execute();
    const averageResolutionTime = avgResolutionResult[0].avg ? parseFloat(avgResolutionResult[0].avg as string) : 0;

    // Get today's created tickets
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCreatedResult = await db
      .select({ count: count() })
      .from(complaintTicketsTable)
      .where(
        and(
          gte(complaintTicketsTable.created_at, today),
          sql`${complaintTicketsTable.created_at} < ${tomorrow}`
        )
      )
      .execute();
    const todayCreated = todayCreatedResult[0].count;

    // Get today's resolved tickets
    const todayResolvedResult = await db
      .select({ count: count() })
      .from(complaintTicketsTable)
      .where(
        and(
          gte(complaintTicketsTable.resolved_at, today),
          sql`${complaintTicketsTable.resolved_at} < ${tomorrow}`,
          eq(complaintTicketsTable.status, 'Solved')
        )
      )
      .execute();
    const todayResolved = todayResolvedResult[0].count;

    return {
      totalTickets,
      ticketsByStatus,
      ticketsByTeam,
      unassignedTickets,
      overduePriorityTickets,
      averageResolutionTime,
      todayCreated,
      todayResolved
    };
  } catch (error) {
    console.error('Dashboard metrics retrieval failed:', error);
    throw error;
  }
};

export const getUserDashboard = async (userId: number): Promise<UserDashboardData> => {
  try {
    // Get user information
    const userResult = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        full_name: usersTable.full_name,
        role: usersTable.role
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (userResult.length === 0) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const user = userResult[0];

    // Get assigned tickets count
    const assignedTicketsResult = await db
      .select({ count: count() })
      .from(complaintTicketsTable)
      .where(eq(complaintTicketsTable.assigned_to, userId))
      .execute();
    const assignedTickets = assignedTicketsResult[0].count;

    // Get tickets in progress
    const inProgressResult = await db
      .select({ count: count() })
      .from(complaintTicketsTable)
      .where(
        and(
          eq(complaintTicketsTable.assigned_to, userId),
          eq(complaintTicketsTable.status, 'In Progress')
        )
      )
      .execute();
    const ticketsInProgress = inProgressResult[0].count;

    // Get resolved tickets
    const resolvedResult = await db
      .select({ count: count() })
      .from(complaintTicketsTable)
      .where(
        and(
          eq(complaintTicketsTable.assigned_to, userId),
          eq(complaintTicketsTable.status, 'Solved')
        )
      )
      .execute();
    const ticketsResolved = resolvedResult[0].count;

    // Calculate personal average resolution time
    const personalAvgResult = await db
      .select({
        avg: avg(
          sql`EXTRACT(EPOCH FROM (${complaintTicketsTable.resolved_at} - ${complaintTicketsTable.created_at})) / 3600`
        )
      })
      .from(complaintTicketsTable)
      .where(
        and(
          eq(complaintTicketsTable.assigned_to, userId),
          sql`${complaintTicketsTable.resolved_at} IS NOT NULL`,
          eq(complaintTicketsTable.status, 'Solved')
        )
      )
      .execute();
    const personalAvgResolutionTime = personalAvgResult[0].avg ? parseFloat(personalAvgResult[0].avg as string) : 0;

    // Get recent tickets (last 10 assigned to user)
    const recentTicketsResult = await db
      .select({
        id: complaintTicketsTable.id,
        customer_name: complaintTicketsTable.customer_name,
        issue_description: complaintTicketsTable.issue_description,
        status: complaintTicketsTable.status,
        priority: complaintTicketsTable.issue_priority,
        created_at: complaintTicketsTable.created_at
      })
      .from(complaintTicketsTable)
      .where(eq(complaintTicketsTable.assigned_to, userId))
      .orderBy(desc(complaintTicketsTable.created_at))
      .limit(10)
      .execute();

    const recentTickets = recentTicketsResult.map(ticket => ({
      id: ticket.id,
      customer_name: ticket.customer_name,
      issue_description: ticket.issue_description,
      status: ticket.status as TicketStatus,
      priority: ticket.priority,
      created_at: ticket.created_at
    }));

    return {
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role as UserRole
      },
      personalMetrics: {
        assignedTickets,
        ticketsInProgress,
        ticketsResolved,
        averageResolutionTime: personalAvgResolutionTime
      },
      recentTickets
    };
  } catch (error) {
    console.error('User dashboard retrieval failed:', error);
    throw error;
  }
};